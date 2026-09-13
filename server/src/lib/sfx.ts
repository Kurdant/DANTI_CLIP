import fs from "node:fs";
import path from "node:path";
import type { ServerEnv } from "./env.js";

const AUDIO_EXT = new Set([".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"]);

export interface SfxFile {
  fileName: string;
  title: string;
  url: string;
}

function isAudio(name: string): boolean {
  return AUDIO_EXT.has(path.extname(name).toLowerCase());
}

/** Liste les sound effects disponibles dans le dossier SFX_DIR. */
export function listSfx(env: ServerEnv): SfxFile[] {
  try {
    if (!fs.existsSync(env.sfxDir)) return [];
    return fs
      .readdirSync(env.sfxDir)
      .filter(isAudio)
      .sort((a, b) => a.localeCompare(b))
      .map((fileName) => ({
        fileName,
        title: fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(),
        url: `/api/sfx/${encodeURIComponent(fileName)}`,
      }));
  } catch {
    return [];
  }
}

/** Chemin absolu d'un SFX (protection path traversal), ou null. */
export function resolveSfxAbs(env: ServerEnv, fileName: string): string | null {
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return null;
  const base = path.resolve(env.sfxDir);
  const abs = path.resolve(base, fileName);
  if (!abs.startsWith(base + path.sep) || !isAudio(fileName)) return null;
  return fs.existsSync(abs) ? abs : null;
}

/**
 * Nom de fichier sur sans collision, en CONSERVANT l'extension audio.
 */
export function safeSfxName(dir: string, original: string): string {
  const dot = original.lastIndexOf(".");
  const ext = (dot >= 0 ? original.slice(dot) : "").toLowerCase();
  const safeExt = AUDIO_EXT.has(ext) ? ext : ".mp3";
  const base = (dot >= 0 ? original.slice(0, dot) : original)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80) || "sfx";
  let name = `${base}${safeExt}`;
  let i = 1;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${base}(${i})${safeExt}`;
    i++;
  }
  return name;
}

/**
 * Choisit un SFX par intention (pattern dans le nom), sinon un au hasard.
 * - "impact" : whoosh, boom, impact, intro, start, swish, swoosh, transition
 * - "ding"   : ding, pop, tick, click, hit, beep, chime, punch
 */
export function pickSfx(env: ServerEnv, pattern: RegExp, exclude?: string): string | null {
  const all = listSfx(env);
  if (all.length === 0) return null;
  const pool = all.filter((s) => pattern.test(s.fileName) && s.fileName !== exclude);
  const chosen = (pool.length > 0 ? pool : all.filter((s) => s.fileName !== exclude));
  if (chosen.length === 0) return null;
  const pick = chosen[Math.floor(Math.random() * chosen.length)];
  return resolveSfxAbs(env, pick.fileName);
}