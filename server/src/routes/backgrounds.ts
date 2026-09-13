import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
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
  userBackgroundsUsedBytes,
} from "../lib/backgrounds.js";
import { normalizeBackground, probeVideo, safeUploadName, validateUpload } from "../lib/videoprocess.js";

/** Taille maximale acceptee a l'upload (fichier brut envoye par le navigateur). */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 Mo
/** Seul le MP4 est accepte : format unique, conteneur maitrise, moins de surface. */
const ALLOWED_EXT = new Set([".mp4", ".m4v"]);

/** Decode un param d'URL une seule fois (Express decode deja) sans planter sur %. */
function decodeOnce(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function backgroundsRouter(env: ServerEnv): Router {
  // Multer ecrit dans un fichier temporaire du dossier utilisateur (req.auth deja pose),
  // puis le handler valide (ffprobe) et normalise la video vers le nom final.
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
      else cb(new Error("Only MP4 format is accepted"));
    },
  });

  const router = Router();

  // Liste des fonds video visibles : ceux de l'utilisateur + ceux par defaut,
  // avec l'espace deja consomme et le quota pour la barre de "place restante".
  router.get("/backgrounds", requireAuth, asyncHandler(async (req, res) => {
    res.json({
      backgrounds: listBackgrounds(env, req.auth!.userId),
      maxUploadBytes: MAX_UPLOAD_BYTES,
      usedBytes: userBackgroundsUsedBytes(env, req.auth!.userId),
      quotaBytes: env.userBgQuotaBytes,
    });
  }));

  // Miniature (1er frame) d'un fond — generee a la volee.
  router.get("/backgrounds/thumb/:source/:fileName", requireAuth, asyncHandler(async (req, res) => {
    const source = req.params.source === "user" ? "user" : "default";
    const thumb = await ensureThumb(env, req.auth!.userId, source, decodeOnce(String(req.params.fileName)));
    if (!thumb) throw new ApiError(404, "Thumbnail unavailable");
    res.sendFile(thumb);
  }));

  // Telecharger un fond video (protection traversal + source explicite).
  router.get("/backgrounds/download/:source/:fileName", requireAuth, asyncHandler(async (req, res) => {
    const source: BackgroundSource = req.params.source === "user" ? "user" : "default";
    const abs = resolveBackgroundBySource(env, req.auth!.userId, source, decodeOnce(String(req.params.fileName)));
    if (!abs) throw new ApiError(404, "Background not found");
    res.download(abs);
  }));

  // Uploader un fond video MP4 sur son profil (probe en lecture seule, puis normalisation).
  router.post("/backgrounds/upload", requireAuth, csrfProtect, (req, res, next) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "File too large (max 200 MB)"));
        }
        return next(new ApiError(400, err instanceof Error ? err.message : "Invalid upload"));
      }
      if (!req.file) return next(new ApiError(400, "No file sent"));

      // Quota de stockage : refuse en amont si l'espace restant est insuffisant.
      const used = userBackgroundsUsedBytes(env, req.auth!.userId);
      if (used + req.file.size > env.userBgQuotaBytes) {
        fs.rmSync(req.file.path, { force: true });
        const reste = Math.max(0, env.userBgQuotaBytes - used);
        return next(new ApiError(400, `Insufficient storage space (${Math.round(reste / (1024 * 1024))} MB left)`));
      }

      const tmp = req.file.path;
      try {
        // 1) Contenu reel du fichier : pas de fake .mp4, pas de bombe.
        const invalid = await validateUpload(tmp);
        if (invalid) return next(new ApiError(400, invalid));

        // 2) Normalisation vers le format cible (encodage propre).
        const dir = userBgDir(env, req.auth!.userId);
        fs.mkdirSync(dir, { recursive: true });
        const name = safeUploadName(dir, req.file.originalname);
        const dest = path.join(dir, name);
        await normalizeBackground(tmp, dest);

        // 3) Verification du resultat : le fichier consomme doit etre sain.
        const out = await probeVideo(dest);
        if (!out || !out.formatName.includes("mp4") || (out.duration ?? 0) <= 0 || out.width <= 0) {
          fs.rmSync(dest, { force: true });
          return next(new ApiError(400, "Invalid video after processing"));
        }

        res.status(201).json({ ok: true, fileName: name, source: "user" });
      } catch {
        fs.rmSync(req.file.path, { force: true });
        return next(new ApiError(400, "Unable to process this video"));
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    });
  });

  // Supprimer un fond uploade sur son profil (jamais les fonds par defaut).
  router.delete("/backgrounds/:fileName", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const name = decodeOnce(String(req.params.fileName));
    const abs = resolveOwnBackground(env, req.auth!.userId, name);
    if (!abs) throw new ApiError(404, "Background not found");
    fs.rmSync(abs, { force: true });
    res.json({ ok: true });
  }));

  // Choisir un fond pour un projet (parmi les siens + par defaut).
  router.post("/projects/:id/background", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    const parsed = backgroundSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");

    const exists =
      resolveBackgroundBySource(env, req.auth!.userId, "user", parsed.data.fileName) ||
      resolveBackgroundBySource(env, req.auth!.userId, "default", parsed.data.fileName);
    if (!exists) throw new ApiError(400, "Invalid background");

    dbQuery(env, "UPDATE projects SET selected_background = ? WHERE id = ?", [parsed.data.fileName, project.id]).run();
    dbQuery(env, "UPDATE projects SET updated_at = datetime('now') WHERE id = ?", [project.id]).run();
    res.json({ ok: true, selectedBackground: parsed.data.fileName });
  }));

  return router;
}
