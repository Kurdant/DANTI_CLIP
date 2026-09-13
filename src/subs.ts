// ============================================================
// Generation de sous-titres ASS (brûlés dans la video via ffmpeg).
// Sources de timings :
//   - wordBoundaries Edge TTS (offset/duration en 100ns) => precis
//   - sinon, repartition du texte sur la duree de l'audio
// ============================================================

import type { Highlight } from "./overlays.js";

export interface WordBoundaryLike {
  offset: number;
  duration: number;
  text: string;
}

const NS_PER_SEC = 10_000_000;

function asSec(v: number): number {
  return v / NS_PER_SEC;
}

/** Format heure ASS : H:MM:SS.CC (centisecondes). */
function assTime(seconds: number): string {
  const cs = Math.round(Math.max(0, seconds) * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${h}:${p(m)}:${p(s)}.${p(c)}`;
}

function escText(t: string): string {
  return t.replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\\N/g, " ");
}

export interface AssOptions {
  fontsize?: number;
  alignment?: number; // 2 = bas centre, 5 = centre, 8 = haut
  maxChars?: number; // nb max de caracteres par ligne
  fontname?: string;
  playResX?: number;
  playResY?: number;
  primary?: string; // couleur du texte (ASS &H00BBGGRR)
  outline?: string; // couleur du contour
  back?: string; // couleur de fond/ombre
  bold?: number;
  /** Apparition animee (fondu + scale) de chaque replique. */
  popIn?: boolean;
  /** Surlignage mot a mot synchronise sur la narration (word boundaries). */
  karaoke?: boolean;
}

export type TextStyle = "classic" | "neon" | "bold" | "minimal" | "boxed" | "pop" | "karaoke";

// Presets de styles de sous-titres (choisissable dans l'interface).
export const TEXT_STYLES: Record<TextStyle, AssOptions> = {
  classic: { fontsize: 90, alignment: 5, bold: -1, primary: "&H00FFFFFF", outline: "&H00101010", back: "&H7F000000" },
  neon: { fontsize: 96, alignment: 5, bold: -1, primary: "&H00FFD28F", outline: "&H00400080", back: "&H7F000000" },
  bold: { fontsize: 100, alignment: 5, bold: -1, primary: "&H00FFFFFF", outline: "&H00000000", back: "&H80000000" },
  minimal: { fontsize: 82, alignment: 5, bold: 0, primary: "&H00FFFFFF", outline: "&H00000000", back: "&H00000000" },
  boxed: { fontsize: 88, alignment: 5, bold: -1, primary: "&H00FFFFFF", outline: "&H00000000", back: "&H00000000", fontname: "Verdana" },
  pop: { fontsize: 94, alignment: 5, bold: -1, primary: "&H00FFFFFF", outline: "&H00101010", back: "&H7F000000", popIn: true },
  karaoke: { fontsize: 98, alignment: 5, bold: -1, primary: "&H00FFFFFF", outline: "&H00101010", back: "&H7F000000", karaoke: true, popIn: true, maxChars: 14 },
};

export const TEXT_STYLE_LABELS: Record<TextStyle, string> = {
  classic: "Classique",
  neon: "Néon",
  bold: "Gras impact",
  minimal: "Minimal",
  boxed: "Encadré",
  pop: "Pop",
  karaoke: "Karaoké",
};

/** Identifiants des styles de sous-titres (source unique cote serveur). */
export const TEXT_STYLE_IDS = Object.keys(TEXT_STYLES) as TextStyle[];

const DEFAULT_OPTIONS: Required<AssOptions> = {
  fontsize: 90,
  alignment: 5,
  maxChars: 18,
  fontname: "Arial",
  playResX: 1080,
  playResY: 1920,
  primary: "&H00FFFFFF",
  outline: "&H00101010",
  back: "&H7F000000",
  bold: -1,
  popIn: false,
  karaoke: false,
};

interface Cue {
  start: number;
  end: number;
  text: string;
  /** Mots avec leurs timings (pour le karaoke). */
  words: { text: string; start: number; end: number }[];
}

/** Regroupe les mots en repliques lisibles (petites lignes), fenetre definie par la ponctuation/silences. */
function buildCues(bounds: WordBoundaryLike[], maxChars: number): Cue[] {
  const cues: Cue[] = [];
  let curStart = 0;
  let curEnd = 0;
  let words: { text: string; start: number; end: number }[] = [];
  let chars = 0;

  const flush = () => {
    if (words.length === 0) return;
    cues.push({ start: curStart, end: curEnd, text: words.map((w) => w.text).join(" "), words });
    words = [];
    chars = 0;
  };

  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i];
    const w = b.text?.trim();
    if (!w) continue;
    const start = asSec(b.offset);
    const end = asSec(b.offset + b.duration);

    const gap = i > 0 ? start - asSec(bounds[i - 1].offset + bounds[i - 1].duration) : 0;
    const hasPunct = /[.!?…]$/.test(w);

    if (words.length > 0 && (chars + w.length + 1 > maxChars || gap > 0.6 || hasPunct)) {
      flush();
    }
    if (words.length === 0) curStart = start;
    curEnd = end;
    words.push({ text: w, start, end });
    chars += w.length + 1;

    if (hasPunct) flush();
  }
  flush();
  return cues;
}

/** Repartit un texte sans timings sur toute la duree (fallback). */
function buildCuesFromText(text: string, durationSec: number, maxChars: number): Cue[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const cues: Cue[] = [];
  let line: string[] = [];
  let chars = 0;
  let lineStart = 0;
  const push = (endIdx: number) => {
    const start = (lineStart / words.length) * durationSec;
    const end = (endIdx / words.length) * durationSec;
    const span = Math.max(0.001, end - start);
    const per = span / Math.max(1, line.length);
    cues.push({
      start,
      end,
      text: line.join(" "),
      words: line.map((w, k) => ({ text: w, start: start + k * per, end: start + (k + 1) * per })),
    });
  };
  words.forEach((w, idx) => {
    const add = line.length ? w.length + 1 : w.length;
    if (chars + add > maxChars && line.length) {
      push(idx);
      line = [w];
      chars = w.length;
      lineStart = idx;
    } else {
      line.push(w);
      chars += add;
    }
  });
  if (line.length) push(words.length);
  return cues;
}

// Emphase inline (un seul flux de texte) : hook/chute plus gros, chiffres jaunes.
const HL_BUMP = 30;
const NUM_COLOR = "&H00FFFF";
// Position du texte : EN BAS, juste au-dessus de la mascotte (elle "parle").
// Alignement 2 = bas-centre ; la marge place le texte au-dessus du personnage.
const CAPTION_ALIGN = 2; // 2 = bas-centre
const CAPTION_MARGIN_V = 750;

/** Construit le contenu d'un fichier ASS pour la video (texte en haut, emphase inline). */
export function buildAss(source: {
  wordBoundaries?: WordBoundaryLike[] | null;
  text?: string;
  durationSec?: number;
  options?: AssOptions;
  highlights?: Highlight[];
}): string {
  const opt = { ...DEFAULT_OPTIONS, ...(source.options ?? {}) };
  let cues: Cue[] = [];
  const wb = source.wordBoundaries?.filter((b) => b.text?.trim());

  if (wb && wb.length > 0) {
    cues = buildCues(wb, opt.maxChars);
  } else if (source.text) {
    const dur = source.durationSec || 1;
    cues = buildCuesFromText(source.text, dur, opt.maxChars);
  }

  // Si aucun timing exploitable, on met un seul texte sur toute la duree.
  if (cues.length === 0 && source.text) {
    cues = [{ start: 0, end: source.durationSec || 1, text: source.text, words: [] }];
  }

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${opt.playResX}
PlayResY: ${opt.playResY}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${opt.fontname},${opt.fontsize},${opt.primary},${opt.primary},${opt.outline},${opt.back},${opt.bold ?? -1},0,0,0,100,100,0,0,1,4,2,${CAPTION_ALIGN},120,120,${CAPTION_MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const overlaps = (c: Cue, s: number, e: number) => c.start < e && c.end > s;
  const hl = source.highlights ?? [];

  // Pop-in : fondu + leger scale a l'apparition de chaque replique.
  const popTag = opt.popIn ? "\\fad(70,60)\\fscx86\\fscy86\\t(0,110,\\fscx100\\fscy100)" : "";
  // Karaoke : le mot prononce est surligne (couleur + gras, SANS scale pour
  // garder la ligne stable -> aucun re-centrage pendant la lecture).
  const karaTag = `\\c${NUM_COLOR}&\\b1`;
  const karaReset = `\\c${opt.primary}\\b0`;

  /** Replique simple : une seule ligne, chiffres en jaune, hook/chute plus gros. */
  const renderPlainCue = (c: Cue, emph: boolean): string => {
    const nums = hl.filter((h) => h.kind === "number" && overlaps(c, h.start, h.end));
    let text = escText(c.text);
    for (const n of nums) {
      const needle = n.text.replace(/\s+/g, " ").trim();
      const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "i");
      text = text.replace(re, `{\\c${NUM_COLOR}&\\b1}$&{\\c${opt.primary}\\b0}`);
    }
    if (emph) text = `{\\fs${opt.fontsize + HL_BUMP}}${text}`;
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,{\\an${CAPTION_ALIGN}${popTag}}${text}`;
  };

  /** Karaoke : un event par mot, le mot prononce est surligne, le reste de la ligne reste affiche. */
  const renderKaraokeCue = (c: Cue, emph: boolean): string => {
    if (c.words.length === 0) return renderPlainCue(c, emph);
    // Taille de police CONSTANTE (pas d'emphase) : la ligne ne change jamais de
    // hauteur ni de largeur -> rendu stable, aucun saut pendant la lecture.
    const lines: string[] = [];
    for (let k = 0; k < c.words.length; k++) {
      const start = k === 0 ? c.start : c.words[k].start;
      const end = k === c.words.length - 1 ? c.end : c.words[k + 1].start;
      const body = c.words
        .map((w, j) => {
          const t = escText(w.text);
          return j === k ? `{${karaTag}}${t}{${karaReset}}` : t;
        })
        .join(" ");
      // Fondu d'entree sans scale (pas de mouvement) au debut de la replique.
      const anim = k === 0 && opt.popIn ? "\\fad(80,60)" : "";
      lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,{\\an${CAPTION_ALIGN}${anim}}${body}`);
    }
    return lines.join("\n");
  };

  const events = cues
    .map((c) => {
      const emph = hl.some((h) => (h.kind === "hook" || h.kind === "chute") && overlaps(c, h.start, h.end));
      return opt.karaoke ? renderKaraokeCue(c, emph) : renderPlainCue(c, emph);
    })
    .join("\n");

  return header + events + "\n";
}

/** Prepare l'ASS avec un preset de style choisi. */
export function assForStyle(style: TextStyle, source: { wordBoundaries?: WordBoundaryLike[] | null; text?: string; durationSec?: number; options?: AssOptions; highlights?: Highlight[] }): string {
  const preset = TEXT_STYLES[style] ?? TEXT_STYLES.classic;
  return buildAss({ ...source, options: { ...preset, ...(source.options ?? {}) } });
}

/** Coupe le hook en lignes centrees (maxChars par ligne) pour le texte geant. */
function wrapHook(text: string, maxChars: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\\N");
}

/**
 * ASS du HOOK PERCUTANT : texte geant plein ecran, centre, apparu des la
 * premiere seconde (pas de fondu d'entree) et fondu court en fin. Le seul
 * objectif est de bloquer le scroll avant que le spectateur ne de-cide.
 */
export function buildBigHookAss(text: string, durationSec?: number): string {
  const dur = Math.max(1.5, Math.min(2.2, durationSec && durationSec > 0 ? durationSec : 2));
  const content = wrapHook(escText(text), 16);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: BigHook,Arial,84,&H00FFFFFF,&H00FFFFFF,&H00101010,&H7F000000,-1,0,0,0,100,100,0,0,1,4,3,5,40,40,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${assTime(dur)},BigHook,,0,0,0,,{\\fad(0,140)}${content}
`;
}

// ============================================================
// HOOK INTRO (type "test") : gros texte ROUGE en HAUT, revele mot a mot,
// pendant que la mascotte est agrandie. Une fois le hook fini, on repasse
// au format normal (voir workflow.ts pour le branchement + montage.ts).
// ============================================================

/**
 * Aligne le hook sur les word boundaries : un timing par mot + la fin du hook.
 * La narration commencant par la phrase hook exacte, les N premiers mots des
 * word boundaries correspondent au hook. Fallback : repartition sur 2.6s.
 */
export function hookTiming(
  hookText: string,
  wb: WordBoundaryLike[] | null,
): { words: { text: string; start: number; end: number }[]; end: number } {
  const hookWords = hookText.trim().split(/\s+/).filter(Boolean);
  const clean = (wb ?? []).filter((b) => b.text && b.text.trim());
  const words: { text: string; start: number; end: number }[] = [];

  if (clean.length >= hookWords.length && hookWords.length > 0) {
    for (let i = 0; i < hookWords.length; i++) {
      const b = clean[i];
      words.push({ text: hookWords[i], start: asSec(b.offset), end: asSec(b.offset + b.duration) });
    }
  } else {
    const total = 2.6;
    const per = total / Math.max(1, hookWords.length);
    hookWords.forEach((w, i) => words.push({ text: w, start: i * per, end: (i + 1) * per }));
  }

  const end = Math.min(words[words.length - 1]?.end ?? 2.6, 4);
  return { words, end };
}

/**
 * ASS du hook intro : texte ROUGE, tres gros, aligne en HAUT, revele mot a mot
 * (chaque mot s'ajoute au precedent). S'affiche des la premiere seconde jusqu'a
 * la fin du hook, puis disparait : les sous-titres normaux prennent le relais.
 * Retourne aussi `end` (fin du hook en secondes) pour piloter la mascotte.
 */
export function buildHookIntroAss(
  hookText: string,
  wb: WordBoundaryLike[] | null,
  opts?: { fontsize?: number; color?: string; marginV?: number },
): { ass: string; end: number } {
  const { words, end } = hookTiming(hookText, wb);
  const fontsize = opts?.fontsize ?? 118;
  const color = opts?.color ?? "&H000000FF"; // rouge pur
  const marginV = opts?.marginV ?? 70;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: HookIntro,Arial,${fontsize},${color},${color},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,8,50,50,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  for (let k = 0; k < words.length; k++) {
    const start = k === 0 ? 0 : words[k].start;
    const stop = k === words.length - 1 ? end : words[k + 1].start;
    const body = words.slice(0, k + 1).map((w) => escText(w.text)).join(" ");
    events.push(`Dialogue: 0,${assTime(start)},${assTime(stop)},HookIntro,,0,0,0,,${body}`);
  }

  return { ass: header + events.join("\n") + "\n", end };
}

