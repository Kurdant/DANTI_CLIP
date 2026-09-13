import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { listMusic, resolveMusicAbs, safeMusicName } from "../lib/music.js";

/** Taille maximale d'une musique a l'upload. */
const MAX_MUSIC_BYTES = 30 * 1024 * 1024; // 30 Mo

/**
 * Bibliotheque de musiques de fond (dossier MUSIC_DIR).
 * Liste, stream (previsualisation), upload et suppression.
 */
export function musicRouter(env: ServerEnv): Router {
  const upload = multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        fs.mkdirSync(env.musicDir, { recursive: true });
        cb(null, env.musicDir);
      },
      filename(_req, _file, cb) {
        cb(null, `_up_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
      },
    }),
    limits: { fileSize: MAX_MUSIC_BYTES },
    fileFilter(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const ok = new Set([".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"]).has(ext);
      if (ok) cb(null, true);
      else cb(new Error("Audio format not supported (mp3, m4a, wav, ogg, aac, flac)"));
    },
  });

  const router = Router();
  router.use(requireAuth);

  // --- List the available tracks ---
  router.get("/music", asyncHandler(async (_req, res) => {
    res.json({ tracks: listMusic(env) });
  }));

  // --- Stream a track (preview) ---
  router.get("/music/:fileName", asyncHandler(async (req, res) => {
    const abs = resolveMusicAbs(env, String(req.params.fileName));
    if (!abs) throw new ApiError(404, "Music not found");
    res.sendFile(abs);
  }));

  // --- Upload a track ---
  router.post("/music/upload", csrfProtect, (req, res, next) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "File too large (max 30 MB)"));
        }
        return next(new ApiError(400, err instanceof Error ? err.message : "Invalid upload"));
      }
      if (!req.file) return next(new ApiError(400, "No file sent"));
      const tmp = req.file.path;
      try {
        fs.mkdirSync(env.musicDir, { recursive: true });
        const name = safeMusicName(env.musicDir, req.file.originalname);
        fs.renameSync(tmp, path.join(env.musicDir, name));
        res.status(201).json({ ok: true, fileName: name });
      } catch {
        fs.rmSync(tmp, { force: true });
        return next(new ApiError(400, "Unable to process this file"));
      }
    });
  });

  // --- Delete a track ---
  router.delete("/music/:fileName", csrfProtect, asyncHandler(async (req, res) => {
    const abs = resolveMusicAbs(env, String(req.params.fileName));
    if (!abs) throw new ApiError(404, "Music not found");
    fs.rmSync(abs, { force: true });
    res.json({ ok: true });
  }));

  return router;
}