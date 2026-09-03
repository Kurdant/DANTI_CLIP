import { Router } from "express";
import type { ServerEnv } from "../lib/env.js";
import { dbQuery, asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { createProjectSchema } from "../validate/schemas.js";
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

  // Creer un projet (auto = idee generee, manual = l'utilisateur fournit l'idee)
  router.post("/projects", asyncHandler(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Donnees invalides");
    const { topic, mode, title } = parsed.data;
    const topicVal = (topic ?? "").trim();
    const finalTitle = title || topicVal.slice(0, 80) || (mode === "auto" ? "Nouveau projet" : "Mon idee");

    const info = dbQuery(
      env,
      "INSERT INTO projects (user_id, title, topic, mode) VALUES (?, ?, ?, ?)",
      [req.auth!.userId, finalTitle, topicVal, mode],
    ).run();

    const row = getProjectRow(env, Number(info.lastInsertRowid), req.auth!.userId)!;
    res.status(201).json({ project: serializeProject(row as unknown as Record<string, unknown>) });
  }));

  // Detail complet d'un projet
  router.get("/projects/:id", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");

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
    if (!project) throw new ApiError(404, "Projet introuvable");
    dbQuery(env, "DELETE FROM projects WHERE id = ?", [project.id]).run();
    res.json({ ok: true });
  }));

  return router;
}
