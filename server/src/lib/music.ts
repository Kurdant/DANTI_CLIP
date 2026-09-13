import fs from "node:fs";
import path from "node:path";
import type { ServerEnv } from "./env.js";

const AUDIO_EXT = new Set([".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"]);

export interface MusicTrack {
  fileName: string;
  title: string;
  url: string;
}

function isAudio(name: string): boolean {
  return AUDIO_EXT.has(path.extname(name).toLowerCase());
}

/** Liste les musiques disponibles dans le dossier MUSIC_DIR. */
export function listMusic(env: ServerEnv): MusicTrack[] {
  try {
    if (!fs.existsSync(env.musicDir)) return [];
    return fs
      .readdirSync(env.musicDir)
      .filter(isAudio)
      .sort((a, b) => a.localeCompare(b))
      .map((fileName) => ({
        fileName,
        title: fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(),
        url: `/api/music/${encodeURIComponent(fileName)}`,
      }));
  } catch {
    return [];
  }
}

/** Chemin absolu d'une musique (protection path traversal), ou null. */
export function resolveMusicAbs(env: ServerEnv, fileName: string): string | null {
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return null;
  const base = path.resolve(env.musicDir);
  const abs = path.resolve(base, fileName);
  if (!abs.startsWith(base + path.sep) || !isAudio(fileName)) return null;
  return fs.existsSync(abs) ? abs : null;
}

/** Choisit une musique : celle demandee, sinon une au hasard, sinon null. */
export function pickMusic(env: ServerEnv, fileName?: string | null): string | null {
  if (fileName) {
    const abs = resolveMusicAbs(env, fileName);
    if (abs) return abs;
  }
  const all = listMusic(env);
  if (all.length === 0) return null;
  const chosen = all[Math.floor(Math.random() * all.length)];
  return resolveMusicAbs(env, chosen.fileName);
}

/**
 * Nom de fichier sur sans collision, en CONSERVANT l'extension audio.
 * (Ne pas reutiliser safeUploadName : il force .mp4, prevu pour les fonds video.)
 */
export function safeMusicName(dir: string, original: string): string {
  const dot = original.lastIndexOf(".");
  const ext = (dot >= 0 ? original.slice(dot) : "").toLowerCase();
  const safeExt = AUDIO_EXT.has(ext) ? ext : ".mp3";
  const base = (dot >= 0 ? original.slice(0, dot) : original)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80) || "track";
  let name = `${base}${safeExt}`;
  let i = 1;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${base}(${i})${safeExt}`;
    i++;
  }
  return name;
}
