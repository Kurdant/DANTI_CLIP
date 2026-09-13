import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { listSfx, resolveSfxAbs, safeSfxName } from "../lib/sfx.js";

/** Taille maximale d'un sound effect. */
const MAX_SFX_BYTES = 15 * 1024 * 1024; // 15 Mo

/**
 * Bibliotheque de sound effects (dossier SFX_DIR).
 * Liste, stream, upload et suppression. Utilises dans le montage
 * (impact au debut, "ding" sur les chiffres).
 */
export function sfxRouter(env: ServerEnv): Router {
  const upload = multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        fs.mkdirSync(env.sfxDir, { recursive: true });
        cb(null, env.sfxDir);
      },
      filename(_req, _file, cb) {
        cb(null, `_up_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
      },
    }),
    limits: { fileSize: MAX_SFX_BYTES },
    fileFilter(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const ok = new Set([".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"]).has(ext);
      if (ok) cb(null, true);
      else cb(new Error("Audio format not supported (mp3, m4a, wav, ogg, aac, flac)"));
    },
  });

  const router = Router();
  router.use(requireAuth);

  // --- List the available effects ---
  router.get("/sfx", asyncHandler(async (_req, res) => {
    res.json({ effects: listSfx(env) });
  }));

  // --- Stream an effect (preview) ---
  router.get("/sfx/:fileName", asyncHandler(async (req, res) => {
    const abs = resolveSfxAbs(env, String(req.params.fileName));
    if (!abs) throw new ApiError(404, "Sound effect not found");
    res.sendFile(abs);
  }));

  // --- Upload an effect ---
  router.post("/sfx/upload", csrfProtect, (req, res, next) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "File too large (max 15 MB)"));
        }
        return next(new ApiError(400, err instanceof Error ? err.message : "Invalid upload"));
      }
      if (!req.file) return next(new ApiError(400, "No file sent"));
      const tmp = req.file.path;
      try {
        fs.mkdirSync(env.sfxDir, { recursive: true });
        const name = safeSfxName(env.sfxDir, req.file.originalname);
        fs.renameSync(tmp, path.join(env.sfxDir, name));
        res.status(201).json({ ok: true, fileName: name });
      } catch {
        fs.rmSync(tmp, { force: true });
        return next(new ApiError(400, "Unable to process this file"));
      }
    });
  });

  // --- Delete an effect ---
  router.delete("/sfx/:fileName", csrfProtect, asyncHandler(async (req, res) => {
    const abs = resolveSfxAbs(env, String(req.params.fileName));
    if (!abs) throw new ApiError(404, "Sound effect not found");
    fs.rmSync(abs, { force: true });
    res.json({ ok: true });
  }));

  return router;
}