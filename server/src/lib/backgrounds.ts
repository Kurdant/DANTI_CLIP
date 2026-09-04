import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerEnv } from "./env.js";
import { resolveWithin } from "./fspath.js";

const execFileAsync = promisify(execFile);

export const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi"]);

export type BackgroundSource = "default" | "user";

export interface BackgroundFile {
  fileName: string;
  source: BackgroundSource;
  downloadUrl: string;
  thumbUrl: string;
}

function isVideo(name: string): boolean {
  return VIDEO_EXT.has(path.extname(name).toLowerCase());
}

function scanDir(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => isVideo(f));
  } catch {
    return [];
  }
}

/** Repertoire des fonds uploadees par un utilisateur (cree a la demande). */
export function userBgDir(env: ServerEnv, userId: number): string {
  return path.resolve(env.userBackgroundsDir, String(userId));
}

export function scanUserBackgrounds(env: ServerEnv, userId: number): string[] {
  return scanDir(userBgDir(env, userId));
}

export function scanDefaultBackgrounds(env: ServerEnv): string[] {
  return scanDir(env.backgroundsDir);
}

/** Tous les fonds visibles par un utilisateur : les siens + les fonds par defaut. */
export function listBackgrounds(env: ServerEnv, userId: number): BackgroundFile[] {
  const defaults = scanDefaultBackgrounds(env).map((f) =>
    bgDto(f, "default", userId),
  );
  const own = scanUserBackgrounds(env, userId)
    // Les fonds de l'utilisateur prennent le dessus a nom egal ; evite les doublons affiches.
    .filter((f) => !defaults.some((d) => d.fileName === f))
    .map((f) => bgDto(f, "user", userId));
  return [...defaults, ...own];
}

function bgDto(fileName: string, source: BackgroundSource, userId: number): BackgroundFile {
  const enc = encodeURIComponent(fileName);
  return {
    fileName,
    source,
    downloadUrl: `/api/backgrounds/download/${source}/${enc}`,
    thumbUrl: `/api/backgrounds/thumb/${source}/${enc}`,
  };
}

/**
 * Retrouve un fond par nom, d'abord dans les uploads de l'utilisateur puis
 * dans les fonds par defaut. Renvoie le chemin absolu + sa source, ou null.
 */
export function resolveBackgroundFile(
  env: ServerEnv,
  userId: number,
  fileName: string,
): { abs: string; source: BackgroundSource } | null {
  const own = resolveWithin(userBgDir(env, userId), fileName);
  if (own && fs.existsSync(own) && isVideo(fileName)) return { abs: own, source: "user" };
  const def = resolveWithin(env.backgroundsDir, fileName);
  if (def && fs.existsSync(def) && isVideo(fileName)) return { abs: def, source: "default" };
  return null;
}

/** Si le fond existe chez l'utilisateur, renvoie son chemin absolu. */
export function resolveOwnBackground(env: ServerEnv, userId: number, fileName: string): string | null {
  return resolveBackgroundBySource(env, userId, "user", fileName);
}

/** Resout un fond (uploads utilisateur d'abord, puis par defaut) en chemin absolu, ou null. */
export function resolveBackgroundAbs(env: ServerEnv, userId: number, fileName: string): string | null {
  return resolveBackgroundFile(env, userId, fileName)?.abs ?? null;
}

/** Resout un fond selon la source explicite (user ou default). */
export function resolveBackgroundBySource(
  env: ServerEnv,
  userId: number,
  source: BackgroundSource,
  fileName: string,
): string | null {
  if (source === "user") {
    const own = resolveWithin(userBgDir(env, userId), fileName);
    return own && fs.existsSync(own) && isVideo(fileName) ? own : null;
  }
  const def = resolveWithin(env.backgroundsDir, fileName);
  return def && fs.existsSync(def) && isVideo(fileName) ? def : null;
}

function thumbsDir(env: ServerEnv): string {
  return path.resolve(env.outputDir, "thumbs");
}

function thumbName(source: BackgroundSource, userId: number, fileName: string): string {
  const safe = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return source === "user" ? `t_u${userId}_${safe}.jpg` : `t_${safe}.jpg`;
}

/** Genere (si absente) la miniature du 1er frame puis renvoie son chemin. */
export async function ensureThumb(
  env: ServerEnv,
  userId: number,
  source: BackgroundSource,
  fileName: string,
): Promise<string | null> {
  const abs = resolveBackgroundBySource(env, userId, source, fileName);
  if (!abs) return null;
  const tDir = thumbsDir(env);
  fs.mkdirSync(tDir, { recursive: true });
  const thumb = path.join(tDir, thumbName(source, userId, fileName));
  if (!fs.existsSync(thumb)) {
    await execFileAsync("ffmpeg", [
      "-y", "-ss", "0.4", "-i", abs,
      "-frames:v", "1", "-vf", "scale=270:480", thumb,
    ]).catch(() => undefined);
  }
  return fs.existsSync(thumb) ? thumb : null;
}
