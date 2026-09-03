import { Router } from "express";
import path from "node:path";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth } from "../auth/middleware.js";
import { dbQuery } from "../auth/middleware.js";
import { getProjectRow } from "../lib/serialize.js";

export function audioRouter(env: ServerEnv): Router {
  const router = Router();

  function loadVoice(voiceId: number, userId: number) {
    const row = dbQuery(
      env,
      "SELECT voices.file_name, voices.project_id FROM voices WHERE voices.id = ?",
      [voiceId],
    ).get() as { file_name: string; project_id: number } | undefined;
    if (!row) throw new ApiError(404, "Voix introuvable");
    const project = getProjectRow(env, Number(row.project_id), userId);
    if (!project) throw new ApiError(404, "Voix introuvable");
    return row;
  }

  // Lecture (playlist inline) du MP3.
  router.get("/audio/:voiceId", asyncHandler(async (req, res) => {
    const row = loadVoice(Number(req.params.voiceId), req.auth!.userId);
    const config = path.resolve(
      (await import("../../../src/config.js")).loadConfig().outputDir,
      "projects",
      String(row.project_id),
    );
    const target = path.resolve(config, row.file_name);
    res.sendFile(target);
  }));

  // Telechargement du MP3 (attachment).
  router.get("/audio/:voiceId/download", asyncHandler(async (req, res) => {
    const row = loadVoice(Number(req.params.voiceId), req.auth!.userId);
    const config = path.resolve(
      (await import("../../../src/config.js")).loadConfig().outputDir,
      "projects",
      String(row.project_id),
    );
    const target = path.resolve(config, row.file_name);
    res.download(target, `voix_${row.project_id}.mp3`);
  }));

  return router;
}
