import { Router } from "express";
import path from "node:path";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth } from "../auth/middleware.js";
import { dbQuery } from "../auth/middleware.js";
import { getProjectRow } from "../lib/serialize.js";

export function videosRouter(env: ServerEnv): Router {
  const router = Router();
  router.use(requireAuth);

  function loadVideo(videoId: number, userId: number) {
    const row = dbQuery(env, "SELECT file_name, project_id FROM videos WHERE id = ?", [videoId]).get() as
      | { file_name: string; project_id: number }
      | undefined;
    if (!row) throw new ApiError(404, "Video introuvable");
    const project = getProjectRow(env, Number(row.project_id), userId);
    if (!project) throw new ApiError(404, "Video introuvable");
    return row;
  }

  router.get("/video/:videoId", asyncHandler(async (req, res) => {
    const row = loadVideo(Number(req.params.videoId), req.auth!.userId);
    const config = path.resolve(
      (await import("../../../src/config.js")).loadConfig().outputDir,
      "projects",
      String(row.project_id),
    );
    res.sendFile(path.resolve(config, row.file_name));
  }));

  router.get("/video/:videoId/download", asyncHandler(async (req, res) => {
    const row = loadVideo(Number(req.params.videoId), req.auth!.userId);
    const config = path.resolve(
      (await import("../../../src/config.js")).loadConfig().outputDir,
      "projects",
      String(row.project_id),
    );
    res.download(path.resolve(config, row.file_name), `short_${row.project_id}.mp4`);
  }));

  return router;
}
