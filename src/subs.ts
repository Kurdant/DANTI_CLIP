// ============================================================
// Generation de sous-titres ASS (brûlés dans la video via ffmpeg).
// Sources de timings :
//   - wordBoundaries Edge TTS (offset/duration en 100ns) => precis
//   - sinon, repartition du texte sur la duree de l'audio
// ============================================================

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
}

export type TextStyle = "classic" | "neon" | "bold" | "minimal" | "boxed";

// Presets de styles de sous-titres (choisissable dans l'interface).
export const TEXT_STYLES: Record<TextStyle, AssOptions> = {
  classic: { fontsize: 58, alignment: 5, bold: -1, primary: "&H00FFFFFF", outline: "&H00101010", back: "&H7F000000" },
  neon: { fontsize: 66, alignment: 5, bold: -1, primary: "&H00FFD28F", outline: "&H00400080", back: "&H7F000000" },
  bold: { fontsize: 74, alignment: 5, bold: -1, primary: "&H00FFFFFF", outline: "&H00000000", back: "&H80000000" },
  minimal: { fontsize: 52, alignment: 5, bold: 0, primary: "&H00FFFFFF", outline: "&H00000000", back: "&H00000000" },
  boxed: { fontsize: 58, alignment: 5, bold: -1, primary: "&H00FFFFFF", outline: "&H00000000", back: "&H00000000", fontname: "Verdana" },
};

export const TEXT_STYLE_LABELS: Record<TextStyle, string> = {
  classic: "Classique",
  neon: "Néon",
  bold: "Gras impact",
  minimal: "Minimal",
  boxed: "Encadré",
};

const DEFAULT_OPTIONS: Required<AssOptions> = {
  fontsize: 58,
  alignment: 5,
  maxChars: 34,
  fontname: "Arial",
  playResX: 1080,
  playResY: 1920,
  primary: "&H00FFFFFF",
  outline: "&H00101010",
  back: "&H7F000000",
  bold: -1,
};

interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Regroupe les mots en repliques lisibles (petites lignes), fenetre definie par la ponctuation/silences. */
function buildCues(bounds: WordBoundaryLike[], maxChars: number): Cue[] {
  const cues: Cue[] = [];
  let curStart = 0;
  let curEnd = 0;
  let words: string[] = [];
  let chars = 0;

  const flush = () => {
    if (words.length === 0) return;
    cues.push({ start: curStart, end: curEnd, text: words.join(" ") });
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
    words.push(w);
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
  words.forEach((w, idx) => {
    const add = line.length ? w.length + 1 : w.length;
    if (chars + add > maxChars && line.length) {
      const frac = idx / words.length;
      const start = lineStart / words.length * durationSec;
      const end = frac * durationSec;
      cues.push({ start, end, text: line.join(" ") });
      line = [w];
      chars = w.length;
      lineStart = idx;
    } else {
      line.push(w);
      chars += add;
    }
  });
  if (line.length) {
    cues.push({
      start: (lineStart / words.length) * durationSec,
      end: durationSec,
      text: line.join(" "),
    });
  }
  return cues;
}

/** Construit le contenu d'un fichier ASS pour la video (texte centre, ombre lisible). */
export function buildAss(source: {
  wordBoundaries?: WordBoundaryLike[] | null;
  text?: string;
  durationSec?: number;
  options?: AssOptions;
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

  // Si aucun timing exploitable, on met un seul texte centre sur toute la duree.
  if (cues.length === 0 && source.text) {
    cues = [{ start: 0, end: source.durationSec || 1, text: source.text }];
  }

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${opt.playResX}
PlayResY: ${opt.playResY}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${opt.fontname},${opt.fontsize},${opt.primary},${opt.primary},${opt.outline},${opt.back},${opt.bold ?? -1},0,0,0,100,100,0,0,1,4,2,${opt.alignment},120,120,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,{\\an${opt.alignment}}${escText(c.text)}`,
    )
    .join("\n");

  return header + events + "\n";
}

/** Prepare l'ASS avec un preset de style choisi. */
export function assForStyle(style: TextStyle, source: { wordBoundaries?: WordBoundaryLike[] | null; text?: string; durationSec?: number; options?: AssOptions }): string {
  const preset = TEXT_STYLES[style] ?? TEXT_STYLES.classic;
  return buildAss({ ...source, options: { ...preset, ...(source.options ?? {}) } });
}
