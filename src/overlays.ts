import type { WordBoundaryLike } from "./subs.js";
import type { ScriptResult } from "./prompts.js";

// ============================================================
// OVERLAYS - montage leger dynamique (piste A).
// Extrait du script + des wordBoundaries les "highlights" :
//   - le HOOK en gros au debut
//   - les CHIFFRES en gros au moment ou ils sont prononces
//   - la CHUTE en gros a la fin (echo au hook, renforce le rewatch)
// Ces highlights sont ensuite injectes dans le ASS pour etre
// superposes au rendu (texte incruste centre, style "HL").
// ============================================================

const NS_PER_SEC = 10_000_000;

export interface Highlight {
  text: string;
  start: number; // secondes
  end: number; // secondes
  kind: "hook" | "number" | "chute";
}

function asSec(v: number): number {
  return v / NS_PER_SEC;
}

function parseDur(d: string): number {
  const m = d.match(/(\d+(?:\.\d+)?)s?/i);
  return m ? Number(m[1]) : 0;
}

// Le hook est limite a "max 12 mots" par le prompt. On tronque donc a 12 mots,
// sans couper une phrase en plein milieu : la chute fait echo au hook.
const MAX_TEXT_WORDS = 12;

function trimText(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length > MAX_TEXT_WORDS) return words.slice(0, MAX_TEXT_WORDS).join(" ");
  return words.join(" ");
}

/** Retrouve le timing (start,end) d'une sequence de mots dans les wordBoundaries. */
function timingForText(wb: WordBoundaryLike[], needle: string): { start: number; end: number } | null {
  const n = needle.trim().toLowerCase();
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  for (let i = 0; i < wb.length; i++) {
    if (wb[i].text.trim().toLowerCase() !== words[0]) continue;
    let ok = true;
    for (let j = 1; j < words.length; j++) {
      if (i + j >= wb.length || wb[i + j].text.trim().toLowerCase() !== words[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const start = asSec(wb[i].offset);
      const end = asSec(wb[i + words.length - 1].offset + wb[i + words.length - 1].duration);
      return { start, end };
    }
  }
  return null;
}

/** Chiffres (tokens numeriques) dans les wordBoundaries, groupes si consecutifs. */
function extractNumberHighlights(wb: WordBoundaryLike[]): Highlight[] {
  const hs: Highlight[] = [];
  let i = 0;
  while (i < wb.length) {
    const t = wb[i].text ?? "";
    if (/\d/.test(t)) {
      let j = i;
      const parts: string[] = [];
      while (j < wb.length && /\d/.test(wb[j].text ?? "")) {
        parts.push(wb[j].text.trim());
        j++;
      }
      const start = asSec(wb[i].offset);
      const end = asSec(wb[j - 1].offset + wb[j - 1].duration);
      const text = trimText(parts.join(" "));
      if (text) hs.push({ text, start, end, kind: "number" });
      i = j;
    } else {
      i++;
    }
  }
  return hs;
}

/** Timings des parties de la structure, normalises sur la duree de l'audio. */
export function partTimings(script: ScriptResult, durationSec: number): { partie: string; start: number; end: number }[] {
  const parts = script.structure ?? [];
  const durs = parts.map((p) => parseDur(p.duree));
  const total = durs.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const scale = durationSec > 0 ? durationSec / total : 1;
  let cursor = 0;
  return parts.map((p, idx) => {
    const start = cursor * scale;
    cursor += durs[idx];
    return { partie: p.partie, start, end: cursor * scale };
  });
}

/**
 * Extrait les highlights d'un script.
 * - hook : au debut (jusqu'a ~3.5s ou au debut du corps)
 * - chute : la derniere partie "chute" (ou la derniere partie si aucune)
 * - nombres : tokens numeriques (limites, fusionnes si proches)
 */
export function extractHighlights(
  script: ScriptResult,
  wb: WordBoundaryLike[] | null,
  durationSec: number,
): Highlight[] {
  const hs: Highlight[] = [];
  const parts = partTimings(script, durationSec);

  // Hook au debut.
  if (script.hook) {
    const text = trimText(script.hook);
    if (text) {
      const bodyStart = parts.find((p) => p.partie === "corps")?.start;
      const end = Math.min(3.5, bodyStart ?? durationSec, durationSec);
      hs.push({ text, start: 0, end, kind: "hook" });
    }
  }

  // Chute (echo au hook) : la derniere partie "chute", sinon la derniere partie.
  const chute = [...parts].reverse().find((p) => p.partie === "chute") ?? parts[parts.length - 1];
  if (chute && chute.end > chute.start) {
    const text = trimText(chuteText(script, chute.partie));
    if (text) hs.push({ text, start: chute.start, end: chute.end, kind: "chute" });
  }

  // Nombres.
  if (wb && wb.length > 0) {
    const nums = extractNumberHighlights(wb).filter((h) => h.end > h.start);
    // Fusionne les nombres tres proches (intervalle < 0.8s) et limite a 4.
    const merged: Highlight[] = [];
    for (const n of nums) {
      const last = merged[merged.length - 1];
      if (last && n.start - last.end < 0.8) {
        last.end = Math.max(last.end, n.end);
        if (last.text.length + n.text.length < 22) last.text = `${last.text} ${n.text}`;
      } else {
        merged.push({ ...n });
      }
    }
    // Ne garde que les nombres assez longs en duree pour etre lus (>= 0.4s).
    hs.push(...merged.filter((h) => h.end - h.start >= 0.4).slice(0, 4));
  }

  // Tri par temps de debut, dedoublonne les chevauchements avec le hook.
  return hs
    .sort((a, b) => a.start - b.start)
    .filter((h, idx, arr) => {
      const prev = arr[idx - 1];
      if (prev && h.kind === "number" && h.start < prev.end) return false;
      return true;
    });
}

/** Recupere le texte de la partie cible (chute) depuis la structure. */
function chuteText(script: ScriptResult, partie: string): string {
  const p = script.structure?.find((x) => x.partie === partie);
  return p?.texte ?? "";
}
