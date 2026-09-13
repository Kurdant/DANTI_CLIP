import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Duree maximale d'un fond video (clips de fond 30-40 s par usage). */
export const MAX_VIDEO_SECONDS = 120;
/** Resolution maximale acceptee (evite les fichiers exotiques / lourds). */
export const MAX_DIMENSION = 4096;
/** Timeout ffmpeg/ffprobe : un fichier malicieux ne doit pas bloquer le serveur. */
export const PROBE_TIMEOUT_MS = 30_000;
export const FFMPEG_TIMEOUT_MS = 120_000;

export interface ProbeInfo {
  codecName: string | null;
  width: number;
  height: number;
  duration: number | null;
  formatName: string;
}

/** Probre une video (lecture seule) avec garde-fous : timeout, video seulement. */
export async function probeVideo(filePath: string): Promise<ProbeInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-print_format", "json",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height",
        "-show_entries", "format=format_name,duration",
        filePath,
      ],
      { timeout: PROBE_TIMEOUT_MS },
    );
    const parsed = JSON.parse(stdout) as {
      streams?: { codec_name?: string; width?: number; height?: number }[];
      format?: { format_name?: string; duration?: string };
    };
    const v = parsed.streams?.[0];
    if (!v || !v.codec_name) return null;
    return {
      codecName: v.codec_name,
      width: Number(v.width) || 0,
      height: Number(v.height) || 0,
      duration: Number(parsed.format?.duration) || 0,
      formatName: parsed.format?.format_name ?? "",
    };
  } catch {
    return null;
  }
}

/** Message d'erreur utilisateur si le fichier n'est pas un MP4 exploitable, sinon null. */
export async function validateUpload(filePath: string): Promise<string | null> {
  const info = await probeVideo(filePath);
  if (!info) return "Unreadable or invalid video (not a usable MP4)";
  if (!info.formatName.includes("mp4")) return "Only MP4 format is accepted";
  if (info.width <= 0 || info.height <= 0 || info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) {
    return `Resolution too large (max ${MAX_DIMENSION}px per side)`;
  }
  if ((info.duration ?? 0) > MAX_VIDEO_SECONDS) return `Video too long (max ${MAX_VIDEO_SECONDS} s)`;
  return null;
}

/** Normalise une video vers le format cible : 1080x1920, H.264, yuv420p, 30fps, sans audio. */
export async function normalizeBackground(src: string, dest: string): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i", src,
      "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "21",
      "-maxrate", "12M",
      "-bufsize", "20M",
      "-pix_fmt", "yuv420p",
      "-an",
      "-movflags", "+faststart",
      dest,
    ],
    { timeout: FFMPEG_TIMEOUT_MS },
  );
}

/** Slugifie un titre en nom de fichier sur disque : [a-z0-9] + tirets. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enleve les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Nom de fichier video unique a partir d'un titre (slug + suffixe anti-collision). Sortie en .mp4. */
export function uniqueVideoName(dir: string, title: string): string {
  const base = slugify(title) || "video";
  let name = `${base}.mp4`;
  let i = 1;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${base}(${i}).mp4`;
    i++;
  }
  return name;
}

/** Nom de fichier sur disque : base saine + suffixe anti-collision. Sortie en .mp4. */
export function safeUploadName(dir: string, original: string): string {
  const dot = original.lastIndexOf(".");
  const base = (dot >= 0 ? original.slice(0, dot) : original)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  let name = `${base}.mp4`;
  let i = 1;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${base}(${i}).mp4`;
    i++;
  }
  return name;
}
