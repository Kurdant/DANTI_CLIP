import { Router } from "express";
import type { ServerEnv } from "../lib/env.js";
import { dbQuery, asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { createProjectSchema, updateProjectSchema } from "../validate/schemas.js";
import { DEFAULT_VIDEO_TYPE, listVideoTypes } from "../../../src/videoTypes.js";
import {
  serializeProject,
  getIdeas,
  getScripts,
  getVoices,
  getVideos,
  getProjectRow,
} from "../lib/serialize.js";

export function projectsRouter(env: ServerEnv): Router {
  const router = Router();

  // Lire la liste des projets de l'utilisateur
  router.get("/projects", asyncHandler(async (req, res) => {
    const rows = dbQuery(
      env,
      "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC",
      [req.auth!.userId],
    ).all() as Record<string, unknown>[];
    const projects = rows.map((r) => serializeProject(r));
    res.json({ projects });
  }));

  // Catalogue des types de video disponibles (cards du createur de projet)
  router.get("/video-types", asyncHandler(async (_req, res) => {
    res.json({ videoTypes: listVideoTypes() });
  }));

  // Creer un projet (auto = idee generee, manual = l'utilisateur fournit l'idee)
  router.post("/projects", asyncHandler(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");
    const { topic, mode, title, videoType } = parsed.data;
    const topicVal = (topic ?? "").trim();
    const finalTitle = title || topicVal.slice(0, 80) || (mode === "auto" ? "New project" : "My idea");
    const typeVal = videoType ?? DEFAULT_VIDEO_TYPE;

    const info = dbQuery(
      env,
      "INSERT INTO projects (user_id, title, topic, mode, video_type) VALUES (?, ?, ?, ?, ?)",
      [req.auth!.userId, finalTitle, topicVal, mode, typeVal],
    ).run();

    const row = getProjectRow(env, Number(info.lastInsertRowid), req.auth!.userId)!;
    res.status(201).json({ project: serializeProject(row as unknown as Record<string, unknown>) });
  }));

  // Mettre a jour un projet (ex. theme renseigne manuellement avant le script)
  router.patch("/projects/:id", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");

    const updates: string[] = [];
    const params: unknown[] = [];
    if (parsed.data.topic !== undefined) {
      updates.push("topic = ?");
      params.push((parsed.data.topic ?? "").trim());
      // Le theme manuel prime sur une eventuelle idee IA selectionnee.
      updates.push("selected_idea_id = NULL");
    }
    if (updates.length === 0) {
      return res.json({ project: serializeProject(project as unknown as Record<string, unknown>) });
    }
    updates.push("updated_at = datetime('now')");
    params.push(project.id);
    dbQuery(env, `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`, params).run();

    const row = getProjectRow(env, project.id, req.auth!.userId)!;
    res.json({ project: serializeProject(row as unknown as Record<string, unknown>) });
  }));

  // Detail complet d'un projet
  router.get("/projects/:id", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");

    res.json({
      project: {
        ...serializeProject(project as unknown as Record<string, unknown>),
        ideas: getIdeas(env, project.id),
        scripts: getScripts(env, project.id),
        voices: getVoices(env, project.id),
        videos: getVideos(env, project.id),
      },
    });
  }));

  // Supprimer un projet
  router.delete("/projects/:id", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    dbQuery(env, "DELETE FROM projects WHERE id = ?", [project.id]).run();
    res.json({ ok: true });
  }));

  return router;
}
