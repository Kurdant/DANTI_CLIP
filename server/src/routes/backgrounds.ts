import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { dbQuery } from "../auth/middleware.js";
import { backgroundSchema } from "../validate/schemas.js";
import { getProjectRow } from "../lib/serialize.js";
import {
  type BackgroundSource,
  resolveBackgroundBySource,
  resolveOwnBackground,
  ensureThumb,
  listBackgrounds,
  userBgDir,
} from "../lib/backgrounds.js";

const execFileAsync = promisify(execFile);

/** Taille maximale acceptee a l'upload (fichier brut envoye par le navigateur). */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 Mo
const ALLOWED_EXT = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi"]);

/** Nom de fichier sur disque : base saine + suffixe anti-collision. Sortie ajoutee en .mp4. */
function safeUploadName(dir: string, original: string): string {
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

/**
 * Normalise une video de fond uploadee vers le format de rendu cible :
 * 1080x1920 (9:16 recadre), H.264, yuv420p, ~30fps, sans piste audio.
 * Garantit un rendu ffmpeg stable et un stockage maitrise.
 */
async function normalizeBackground(src: string, dest: string): Promise<void> {
  await execFileAsync("ffmpeg", [
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
  ]);
}

export function backgroundsRouter(env: ServerEnv): Router {
  // Multer ecrit dans un fichier temporaire du dossier utilisateur (req.auth deja pose),
  // puis le handler normalise la video vers le nom final.
  const upload = multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        const dir = userBgDir(env, req.auth!.userId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename(_req, _file, cb) {
        cb(null, `_up_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
      },
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_EXT.has(ext)) cb(null, true);
      else cb(new Error("Fichier non supporte"));
    },
  });

  const router = Router();

  // Liste des fonds video visibles : ceux de l'utilisateur + ceux par defaut.
  router.get("/backgrounds", requireAuth, asyncHandler(async (req, res) => {
    res.json({ backgrounds: listBackgrounds(env, req.auth!.userId), maxUploadBytes: MAX_UPLOAD_BYTES });
  }));

  // Miniature (1er frame) d'un fond — generee a la volee.
  router.get("/backgrounds/thumb/:source/:fileName", requireAuth, asyncHandler(async (req, res) => {
    const source = req.params.source === "user" ? "user" : "default";
    const thumb = await ensureThumb(env, req.auth!.userId, source, decodeURIComponent(String(req.params.fileName)));
    if (!thumb) throw new ApiError(404, "Miniature indisponible");
    res.sendFile(thumb);
  }));

  // Telecharger un fond video (protection traversal + source explicite).
  router.get("/backgrounds/download/:source/:fileName", requireAuth, asyncHandler(async (req, res) => {
    const source: BackgroundSource = req.params.source === "user" ? "user" : "default";
    const abs = resolveBackgroundBySource(env, req.auth!.userId, source, decodeURIComponent(String(req.params.fileName)));
    if (!abs) throw new ApiError(404, "Fond introuvable");
    res.download(abs);
  }));

  // Uploader un fond video sur son profil (normalise a la volee).
  router.post("/backgrounds/upload", requireAuth, csrfProtect, (req, res, next) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "Fichier trop volumineux (max 200 Mo)"));
        }
        return next(new ApiError(400, err instanceof Error ? err.message : "Upload invalide"));
      }
      if (!req.file) return next(new ApiError(400, "Aucun fichier envoye"));

      const dir = userBgDir(env, req.auth!.userId);
      const name = safeUploadName(dir, req.file.originalname);
      const dest = path.join(dir, name);
      fs.mkdirSync(dir, { recursive: true });

      try {
        await normalizeBackground(req.file.path, dest);
      } catch {
        fs.rmSync(req.file.path, { force: true });
        fs.rmSync(dest, { force: true });
        return next(new ApiError(400, "Impossible de traiter cette video (codec/format invalide)"));
      } finally {
        fs.rmSync(req.file.path, { force: true });
      }

      res.status(201).json({ ok: true, fileName: name, source: "user" });
    });
  });

  // Supprimer un fond uploade sur son profil (jamais les fonds par defaut).
  router.delete("/backgrounds/:fileName", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const name = decodeURIComponent(String(req.params.fileName));
    const abs = resolveOwnBackground(env, req.auth!.userId, name);
    if (!abs) throw new ApiError(404, "Fond introuvable");
    fs.rmSync(abs, { force: true });
    res.json({ ok: true });
  }));

  // Choisir un fond pour un projet (parmi les siens + par defaut).
  router.post("/projects/:id/background", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");
    const parsed = backgroundSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Donnees invalides");

    const exists =
      resolveBackgroundBySource(env, req.auth!.userId, "user", parsed.data.fileName) ||
      resolveBackgroundBySource(env, req.auth!.userId, "default", parsed.data.fileName);
    if (!exists) throw new ApiError(400, "Fond invalide");

    dbQuery(env, "UPDATE projects SET selected_background = ? WHERE id = ?", [parsed.data.fileName, project.id]).run();
    dbQuery(env, "UPDATE projects SET updated_at = datetime('now') WHERE id = ?", [project.id]).run();
    res.json({ ok: true, selectedBackground: parsed.data.fileName });
  }));

  return router;
}
