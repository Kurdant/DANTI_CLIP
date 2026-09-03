import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { dbQuery } from "../auth/middleware.js";
import { backgroundSchema } from "../validate/schemas.js";
import { getProjectRow } from "../lib/serialize.js";
import { resolveWithin } from "../lib/fspath.js";

const execFileAsync = promisify(execFile);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi"]);

function scanBackgrounds(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

function thumbsDir(env: ServerEnv): string {
  return path.resolve(env.outputDir, "thumbs");
}

export function backgroundsRouter(env: ServerEnv): Router {
  const router = Router();

  // Liste des fonds video disponibles (non authentifie : ce sont des ressources statiques).
  router.get("/backgrounds", asyncHandler(async (_req, res) => {
    const files = scanBackgrounds(env.backgroundsDir);
    res.json({
      backgrounds: files.map((f) => ({
        fileName: f,
        downloadUrl: `/api/backgrounds/download/${encodeURIComponent(f)}`,
        thumbUrl: `/api/backgrounds/thumb/${encodeURIComponent(f)}`,
      })),
    });
  }));

  // Miniature (1er frame) d'un fond video — cachee a la volee.
  router.get("/backgrounds/thumb/:fileName", asyncHandler(async (req, res) => {
    const target = resolveWithin(env.backgroundsDir, String(req.params.fileName));
    if (!target || !fs.existsSync(target)) throw new ApiError(404, "Fond introuvable");
    const tDir = thumbsDir(env);
    fs.mkdirSync(tDir, { recursive: true });
    const thumb = path.join(tDir, "t_" + String(req.params.fileName).replace(/[^a-zA-Z0-9._-]/g, "_") + ".jpg");
    if (!fs.existsSync(thumb)) {
      await execFileAsync("ffmpeg", ["-y", "-ss", "0.4", "-i", target, "-frames:v", "1", "-vf", "scale=270:480", thumb]).catch(() => undefined);
    }
    if (!fs.existsSync(thumb)) throw new ApiError(404, "Miniature indisponible");
    res.sendFile(thumb);
  }));

  // Telecharger un fond video (protection traversal).
  router.get("/backgrounds/download/:fileName", asyncHandler(async (req, res) => {
    const target = resolveWithin(env.backgroundsDir, String(req.params.fileName));
    if (!target || !fs.existsSync(target)) throw new ApiError(404, "Fond introuvable");
    res.download(target);
  }));

  // Choisir un fond pour un projet.
  router.post("/projects/:id/background", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");
    const parsed = backgroundSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Donnees invalides");

    const allowed = scanBackgrounds(env.backgroundsDir);
    if (!allowed.includes(parsed.data.fileName)) throw new ApiError(400, "Fond invalide");

    dbQuery(env, "UPDATE projects SET selected_background = ? WHERE id = ?", [parsed.data.fileName, project.id]).run();
    dbQuery(env, "UPDATE projects SET updated_at = datetime('now') WHERE id = ?", [project.id]).run();
    res.json({ ok: true, selectedBackground: parsed.data.fileName });
  }));

  return router;
}
