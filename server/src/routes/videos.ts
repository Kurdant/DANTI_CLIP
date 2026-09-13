import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth } from "../auth/middleware.js";
import { dbQuery } from "../auth/middleware.js";
import { getProjectRow, parseTags } from "../lib/serialize.js";
import { loadConfig } from "../../../src/config.js";

export function videosRouter(env: ServerEnv): Router {
  const router = Router();
  router.use(requireAuth);

  /** Slug simple pour un nom de fichier telechargeable (sans ponctuation ni accents). */
  function fileSlug(s: string): string {
    const clean = s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
    return clean || "short";
  }

  function loadVideo(videoId: number, userId: number) {
    const row = dbQuery(env, "SELECT file_name, project_id FROM videos WHERE id = ?", [videoId]).get() as
      | { file_name: string; project_id: number }
      | undefined;
    if (!row) throw new ApiError(404, "Video not found");
    const project = getProjectRow(env, Number(row.project_id), userId);
    if (!project) throw new ApiError(404, "Video not found");
    return row;
  }

  function videoAbsPath(row: { file_name: string; project_id: number }): string {
    return path.resolve(
      loadConfig().outputDir,
      "projects",
      String(row.project_id),
      row.file_name,
    );
  }

  // --- Bibliotheque : toutes les videos gardees par l'utilisateur ---
  router.get("/videos/library", asyncHandler(async (req, res) => {
    const rows = dbQuery(
      env,
      "SELECT v.id, v.file_name, v.duration, v.created_at, v.title, v.description, v.tags, v.youtube_id, v.views, v.likes, v.comments, v.stats_updated_at, v.stats_status, p.title AS project_title, p.id AS project_id " +
        "FROM videos v JOIN projects p ON p.id = v.project_id " +
        "WHERE v.kept = 1 AND p.user_id = ? ORDER BY v.created_at DESC",
      [req.auth!.userId],
    ).all() as Record<string, unknown>[];
    res.json({
      videos: rows.map((r) => ({
        id: Number(r.id),
        projectId: Number(r.project_id),
        projectTitle: String(r.project_title),
        title: r.title ? String(r.title) : null,
        description: r.description ? String(r.description) : null,
        tags: parseTags(r.tags),
        url: `/api/video/${Number(r.id)}`,
        downloadUrl: `/api/video/${Number(r.id)}/download`,
        duration: r.duration != null ? Number(r.duration) : null,
        createdAt: String(r.created_at),
        youtubeId: r.youtube_id ? String(r.youtube_id) : null,
        views: r.views != null ? Number(r.views) : null,
        likes: r.likes != null ? Number(r.likes) : null,
        comments: r.comments != null ? Number(r.comments) : null,
        statsUpdatedAt: r.stats_updated_at ? String(r.stats_updated_at) : null,
        statsStatus: r.stats_status ? String(r.stats_status) : null,
      })),
    });
  }));

  // --- Garder une video dans la bibliotheque (elle ne sera plus purgee) ---
  router.post("/videos/:videoId/keep", asyncHandler(async (req, res) => {
    loadVideo(Number(req.params.videoId), req.auth!.userId);
    dbQuery(env, "UPDATE videos SET kept = 1 WHERE id = ?", [Number(req.params.videoId)]).run();
    res.json({ ok: true });
  }));

  // --- Retirer une video (fichier + enregistrement) ---
  router.delete("/videos/:videoId", asyncHandler(async (req, res) => {
    const row = loadVideo(Number(req.params.videoId), req.auth!.userId);
    try {
      fs.rmSync(videoAbsPath(row), { force: true });
    } catch {
      /* fichier deja absent ou permissions : la ligne est supprimee quand meme */
    }
    dbQuery(env, "DELETE FROM videos WHERE id = ?", [Number(req.params.videoId)]).run();
    res.json({ ok: true });
  }));

  router.get("/video/:videoId", asyncHandler(async (req, res) => {
    const row = loadVideo(Number(req.params.videoId), req.auth!.userId);
    res.sendFile(videoAbsPath(row));
  }));

  router.get("/video/:videoId/download", asyncHandler(async (req, res) => {
    const id = Number(req.params.videoId);
    const row = loadVideo(id, req.auth!.userId);
    // Nom de fichier propre : le titre, sans ponctuation ni accents.
    const t = dbQuery(
      env,
      "SELECT COALESCE(v.title, p.title) AS t FROM videos v JOIN projects p ON p.id = v.project_id WHERE v.id = ?",
      [id],
    ).get() as { t: string | null } | undefined;
    res.download(videoAbsPath(row), `${fileSlug(t?.t ?? "short")}.mp4`);
  }));

  return router;
}
