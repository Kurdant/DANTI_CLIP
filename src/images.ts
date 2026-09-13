import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { ScriptResult } from "./prompts.js";
import { messagesImageQueries } from "./prompts.js";
import type { PartImage } from "./montage.js";
import type { WordBoundaryLike } from "./subs.js";
import type { LlmProvider } from "./llm/types.js";
import { extractJson } from "./llm/openai.js";

// ============================================================
// IMAGES (piste B) - illustration par segment de narration via Pexels.
//   - decoupe le texte_continu en segments (phrases, clauses si longues)
//   - derive une requete SPECIFIQUE a chaque segment
//   - cherche la meilleure image portrait libre de droits par segment
//   - synchronise chaque image sur le timing du segment (wordBoundaries)
// Plus de segments => plus d'images, chacune plus proche du contenu dit.
// Sans cle PEXELS_API_KEY, la piste B est desactivee (fond degrade).
// ============================================================

const PEXELS_SEARCH = "https://api.pexels.com/v1/search";
const PEXELS_VIDEOS = "https://api.pexels.com/videos/search";

/** Nombre max d'images par video : une par phrase / idee cle (pas par clause). */
const MAX_SEGMENTS = 7;
/** Seuil de pertinence minimal d'une photo (0..1). En dessous, on ne l'utilise pas. */
const MIN_RELEVANCE = 0.5;

const NS_PER_SEC = 10_000_000;

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "où", "pour", "par",
  "sur", "avec", "dans", "en", "au", "aux", "ce", "cette", "ces", "qui", "que", "quoi",
  "ne", "pas", "plus", "est", "sont", "être", "avoir", "faire", "les", "son", "sa",
  "ses", "leur", "leurs", "tout", "toute", "tous", "toutes", "mais", "donc", "il",
  "elle", "ils", "elles", "on", "nous", "vous", "je", "tu", "la", "le", "au", "aux",
  "vers", "contre", "entre", "sans", "comme", "pour", "quoi", "comment", "pourquoi",
  "que", "qui", "dont", "où", "l", "d", "qu", "l'", "d'", "n'", "se", "si", "y",
  "à", "a", "son", "ses", "c", "ceci", "cela", "même", "aussi", "très", "plus",
  "abonne", "abonnez", "d'autres", "autre", "autrement", "révélations", "toi",
  "seul", "seule", "suffit", "suffisent", "laisse", "laissent", "soit", "ainsi",
  "puis", "ensuite", "quand", "lorsque", "alors", "donc", "car", "comme", "vers",
  "trop", "beaucoup", "moins", "peu", "près", "environ", "situé", "située",
  // Stopwords anglais (le contenu genere est en anglais).
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "were", "be", "been", "being", "it", "its", "this", "that",
  "these", "those", "you", "your", "we", "our", "they", "their", "he", "she",
  "his", "her", "as", "at", "by", "from", "into", "than", "then", "so", "but",
  "if", "not", "no", "do", "does", "did", "has", "have", "had", "will", "would",
  "can", "could", "should", "may", "might", "must", "about", "more", "most",
  "much", "many", "some", "any", "all", "each", "every", "other", "such",
  "only", "own", "same", "too", "very", "just", "also", "up", "out", "down",
  "over", "under", "again", "once", "here", "there", "when", "where", "why",
  "how", "what", "which", "who", "whom", "while", "because", "before", "after",
  "during", "above", "below", "between", "through", "against", "without",
  "within", "them", "us", "yourself", "itself",
]);

/** Normalise : accent -> ascii, unifie espaces (dont insécable). */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u202f|\u00a0/g, " ")
    .toLowerCase();
}

/** Retire la ponctuation d'un mot pour l'alignement (garde lettres/chiffres/apostrophe/tiret). */
function cleanWord(w: string): string {
  return w
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u202f|\u00a0/g, " ")
    .replace(/[^\p{L}\p{N}'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asSec(v: number): number {
  return v / NS_PER_SEC;
}

function significantWords(text: string): string[] {
  return norm(text)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Requete de recherche depuis un segment de narration (mots-clefs significatifs). */
export function segmentQuery(text: string): string {
  const words = significantWords(text);
  if (words.length === 0) return "";
  return words.slice(0, 4).join(" ");
}

/** Deteche une replique de CTA (a ecarter d'une requete image specifique). */
function isCta(text: string): boolean {
  return /abonne|subscribe|like|partage|commente/i.test(text);
}

/**
 * Decoupe la narration en SEGMENTS : un par phrase, ou par groupe de phrases
 * quand il y en a trop. Une image par phrase / idee cle (jamais par clause) :
 * moins d'images, chacune reste plus longtemps et est mieux choisie.
 */
export function segmentNarration(text: string, maxSegments = MAX_SEGMENTS): string[] {
  const sents = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 2);
  if (sents.length === 0) return [];
  if (sents.length <= maxSegments) return sents;

  // Trop de phrases : fusionne les phrases consecutives en groupes equilibres.
  const counts = sents.map((s) => s.split(/\s+/).filter(Boolean).length);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const target = total / maxSegments;
  const out: string[] = [];
  let buf: string[] = [];
  let bufWords = 0;
  for (let i = 0; i < sents.length; i++) {
    buf.push(sents[i]);
    bufWords += counts[i];
    const groupsLeft = maxSegments - out.length;
    if (bufWords >= target && groupsLeft > 1) {
      out.push(buf.join(" "));
      buf = [];
      bufWords = 0;
    }
  }
  if (buf.length) out.push(buf.join(" "));
  return out;
}

/**
 * Aligne chaque segment sur les wordBoundaries en cherchant SEQUENTIELLEMENT
 * (chaque segment apres le precedent). Les segments sont dans l'ordre de la
 * narration : la chute qui repete le hook est ainsi retrouvee a sa vraie place.
 * On aplati chaque token wb en mots individuels (les nombres "2 000 cm²" sont
 * un seul token, mais on les cherche mot a mot).
 */
export function alignChunks(wb: WordBoundaryLike[], chunks: string[]): ({ start: number; end: number } | null)[] {
  const flat: { word: string; start: number; end: number }[] = [];
  for (const b of wb) {
    const parts = cleanWord(b.text ?? "").split(/\s+/).filter(Boolean);
    const start = asSec(b.offset);
    const dur = asSec(b.duration);
    const per = parts.length > 0 ? dur / parts.length : 0;
    parts.forEach((p, k) => {
      flat.push({ word: p, start: start + k * per, end: start + (k + 1) * per });
    });
  }

  const results: ({ start: number; end: number } | null)[] = [];
  let cursor = 0;
  for (const c of chunks) {
    // Aplati les mots (une apostrophe typographique peut devenir un espace).
    const words = c.split(/\s+/).flatMap((w) => cleanWord(w).split(/\s+/).filter(Boolean));
    if (words.length === 0) {
      results.push(null);
      continue;
    }
    let found: { start: number; end: number } | null = null;
    for (let i = cursor; i < flat.length; i++) {
      if (flat[i].word !== words[0]) continue;
      let ok = true;
      for (let j = 1; j < words.length; j++) {
        if (i + j >= flat.length || flat[i + j].word !== words[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        found = { start: flat[i].start, end: flat[i + words.length - 1].end };
        cursor = i + words.length;
        break;
      }
    }
    results.push(found);
  }
  return results;
}

/** Extrait les mots-clefs de recherche depuis le sujet (stopwords retirés). */
export function subjectQuery(script: ScriptResult, idea?: { sujet?: string; fond?: string } | null): string {
  const raw = idea?.sujet?.trim() || script.titre?.trim() || script.titre_youtube?.trim() || "";
  const words = norm(raw)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  if (words.length > 0) return words.slice(0, 6).join(" ");
  // Fallback : mots du fond décrit.
  const fond = idea?.fond || script.fond || "";
  const f = norm(fond).split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)).slice(0, 6);
  return f.join(" ") || "nature";
}

/** Télécharge une image portrait dans renderDir. */
async function downloadImage(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image Pexels ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

/** Telecharge un fichier (streaming, sans tout bufferiser) dans renderDir. */
async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Fichier Pexels ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

interface PexelsVideoFile {
  file_type?: string;
  quality?: string;
  width?: number;
  height?: number;
  link?: string;
}
interface PexelsVideo {
  duration?: number;
  video_files?: PexelsVideoFile[];
}

/**
 * Cherche un clip video portrait pour une requete. Retourne l'URL du fichier
 * mp4 le plus adapte (portrait, hauteur 1280-1920 de preference) + sa duree.
 */
async function searchBestVideo(apiKey: string, query: string): Promise<{ url: string; duration: number } | null> {
  const url = `${PEXELS_VIDEOS}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5&locale=en-US`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) return null;
  const data = (await res.json()) as { videos?: PexelsVideo[] };
  for (const v of data.videos ?? []) {
    const files = (v.video_files ?? []).filter((f) => f.file_type === "video/mp4" && f.link);
    const portrait = files
      .filter((f) => (f.height ?? 0) > (f.width ?? 0))
      .sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
    const chosen =
      portrait.find((f) => (f.height ?? 0) >= 1280 && (f.height ?? 0) <= 1920) ?? portrait[0];
    if (chosen?.link) return { url: chosen.link, duration: Number(v.duration ?? 0) };
  }
  return null;
}

interface PexelsPhoto {
  src?: { portrait?: string; large2x?: string };
  alt?: string | null;
}

/** Score de pertinence (0..1) d'une photo : couverture des mots-clefs par l'alt. */
function relevanceScore(alt: string, keys: string[]): number {
  if (keys.length === 0) return 0;
  const a = norm(alt);
  const altWords = new Set(a.split(/[^a-z0-9]+/).filter(Boolean));
  let hits = 0;
  let primaryHit = false;
  keys.forEach((k, i) => {
    if (altWords.has(k) || a.includes(k)) {
      hits++;
      if (i === 0) primaryHit = true;
    }
  });
  if (hits === 0) return 0;
  const coverage = hits / keys.length;
  // Bonus si le sujet principal (1er mot-cle) est present dans l'alt.
  return Math.min(1, coverage + (primaryHit ? 0.2 : 0));
}

/**
 * Cherche la meilleure photo portrait pour une requete et ne la retourne que si
 * elle est ASSEZ PERTINENTE. Sinon null : pas d'image plutot qu'une image hors-sujet.
 * On note jusqu'a 15 candidates sur la correspondance de leur alt avec la requete.
 */
async function searchBestPhoto(apiKey: string, query: string): Promise<{ url: string; score: number } | null> {
  const url = `${PEXELS_SEARCH}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=15&locale=en-US`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) return null;
  const data = (await res.json()) as { photos?: PexelsPhoto[] };
  const photos = data.photos ?? [];
  if (photos.length === 0) return null;

  const keys = significantWords(query);
  let best: { url: string; score: number } | null = null;
  for (const p of photos) {
    const src = p.src?.portrait || p.src?.large2x;
    if (!src) continue;
    const alt = (p.alt ?? "").trim();
    // Sans alt : impossible de verifier => score neutre, sous le seuil (rejete).
    const score = alt ? relevanceScore(alt, keys) : 0.35;
    if (!best || score > best.score) best = { url: src, score };
  }
  if (!best || best.score < MIN_RELEVANCE) return null;
  return best;
}

/**
 * Decoupe la narration, cherche une image par segment, synchronisee sur les timings.
 * Retourne les PartImage (file + timings) pour le montage.
 * Prend le temps qu'il faut : chaque segment fait sa propre recherche Pexels.
 */
export async function fetchPartImages(opts: {
  apiKey: string;
  script: ScriptResult;
  idea?: { sujet?: string; fond?: string } | null;
  durationSec: number;
  renderDir: string;
  wordBoundaries?: WordBoundaryLike[] | null;
  /** Fournisseur LLM pour generer des requetes Pexels precises par segment. */
  llm?: LlmProvider | null;
  /** Utiliser des clips video libres (Pexels videos) avant les photos. */
  allowVideos?: boolean;
}): Promise<PartImage[]> {
  const { apiKey, script, idea, durationSec, renderDir, wordBoundaries, llm, allowVideos = false } = opts;
  const text = script.texte_continu ?? "";
  const chunks = segmentNarration(text);
  if (chunks.length === 0) return [];

  await mkdir(renderDir, { recursive: true });
  const subjectQ = subjectQuery(script, idea);

  // Requetes Pexels par segment, generees par l'IA (precises et centrees sur le sujet).
  // Sinon fallback sur l'extraction de mots-clefs (segmentQuery).
  const subject = idea?.sujet?.trim() || script.titre?.trim() || script.titre_youtube?.trim() || subjectQ;
  let queries: string[] = [];
  if (llm && chunks.length > 0) {
    try {
      const raw = await llm.complete(messagesImageQueries({ subject, segments: chunks }));
      const parsed = extractJson<{ queries?: unknown }>(raw);
      if (Array.isArray(parsed.queries)) {
        queries = parsed.queries.map((q) => (typeof q === "string" ? q.trim() : "")).filter(Boolean);
      }
    } catch (e) {
      console.error("[images] generation requetes LLM echec, fallback mots-clefs:", e);
      queries = [];
    }
  }

  // Timings par segment : alignement sequentiel sur les wordBoundaries si dispo.
  const withWb = Boolean(wordBoundaries && wordBoundaries.length > 0);
  let timings: ({ start: number; end: number } | null)[] = withWb
    ? alignChunks(wordBoundaries!, chunks)
    : chunks.map(() => null);

  // Si trop d'echecs d'alignement (ou pas de wb), repartition proportionnelle
  // par nombre de mots, calée sur la duree de la video.
  const aligned = timings.filter(Boolean).length;
  if (!withWb || aligned < Math.ceil(chunks.length * 0.5)) {
    const counts = chunks.map((c) => c.split(/\s+/).filter(Boolean).length);
    const totalWords = counts.reduce((a, b) => a + b, 0) || 1;
    let cursor = 0;
    chunks.forEach((_, i) => {
      const start = (cursor / totalWords) * durationSec;
      cursor += counts[i];
      const end = (cursor / totalWords) * durationSec;
      timings[i] = { start, end: Math.max(start, end) };
    });
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const images: PartImage[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const t = timings[i];
    if (!t) continue;

    // Requete : IA si dispo, sinon mots-clefs ; CTA / peu de mots => sujet.
    let q = (queries[i] || "").trim() || segmentQuery(chunk);
    if (isCta(chunk) || significantWords(chunk).length < 2) q = subjectQ;

    let file: string | null = null;
    let kind: "image" | "video" = "image";

    // 1) PHOTO d'abord : sa pertinence est VERIFIABLE via l'alt. On ne garde que
    //    les photos qui passent le seuil, sinon on prefere ne rien mettre.
    let src: { url: string; score: number } | null = null;
    try {
      src = await searchBestPhoto(apiKey, q || subjectQ);
    } catch {
      src = null;
    }
    await sleep(120);
    if (src) {
      file = `part_${i}.jpg`;
      await downloadImage(src.url, path.join(renderDir, file));
    }

    // 2) Clip video libre, seulement si active et qu'aucune photo pertinente n'a
    //    ete trouvee (un clip ne peut pas etre verifie par texte).
    if (!file && allowVideos) {
      try {
        const v = await searchBestVideo(apiKey, q || subjectQ);
        if (v) {
          const vName = `part_${i}.mp4`;
          await downloadFile(v.url, path.join(renderDir, vName));
          file = vName;
          kind = "video";
        }
      } catch {
        file = null;
      }
      await sleep(120);
    }

    // 3) Rien de pertinent : on prolonge l'image precedente (jamais d'image hors-sujet).
    if (!file) {
      const prev = images[images.length - 1];
      if (prev) prev.end = Math.max(prev.end, t.end);
      continue;
    }
    images.push({ file, start: t.start, end: t.end, kind });
  }

  // Prolonge la derniere image jusqu'a la fin de la video (pas de fond vide en fin).
  if (images.length > 0 && durationSec > 0) {
    images[images.length - 1].end = Math.max(images[images.length - 1].end, durationSec);
  }
  return images;
}
