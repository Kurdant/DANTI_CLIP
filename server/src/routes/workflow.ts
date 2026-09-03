import { Router } from "express";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerEnv } from "../lib/env.js";
import { dbQuery, asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { selectIdeaSchema, scriptActionSchema, voiceSchema } from "../validate/schemas.js";
import { getProjectRow, getIdeas, getScripts, getVoices } from "../lib/serialize.js";
import { loadConfig } from "../../../src/config.js";
import { createLlm, extractJson } from "../../../src/llm/index.js";
import { messagesIdees, messagesScript, type IdeasResult, type ScriptResult } from "../../../src/prompts.js";
import { syntheseVoix, listerVoixFr } from "../../../src/voice.js";

const execFileAsync = promisify(execFile);

function probeDuration(filePath: string): Promise<number | null> {
  return execFileAsync("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_format", filePath,
  ])
    .then(({ stdout }) => {
      const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
      const d = parsed.format?.duration;
      return d ? Number(d) : null;
    })
    .catch(() => null);
}

function touchUpdated(env: ServerEnv, projectId: number): void {
  dbQuery(env, "UPDATE projects SET updated_at = datetime('now') WHERE id = ?", [projectId]).run();
}

export function workflowRouter(env: ServerEnv): Router {
  const router = Router();

  // --- 1) Generer les IDEES ---
  router.post("/projects/:id/ideas", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");

    const config = loadConfig();
    const llm = createLlm(config);
    const raw = await llm.complete(
      messagesIdees({ topic: project.topic, nIdeas: config.nIdeas, language: config.language }),
    );
    const { idees } = extractJson<IdeasResult>(raw);

    // Vide les anciennes idees (regeneration) puis insere.
    dbQuery(env, "DELETE FROM ideas WHERE project_id = ?", [project.id]).run();
    const insert = dbQuery(env, "INSERT INTO ideas (project_id, position, idea_text, hook, angle, fond) VALUES (?, ?, ?, ?, ?, ?)");
    idees.forEach((id, i) => {
      insert.run(project.id, i + 1, id.idee, id.hook ?? null, id.angle ?? null, id.fond ?? null);
    });
    dbQuery(env, "UPDATE projects SET status = 'ideas' WHERE id = ?", [project.id]).run();
    touchUpdated(env, project.id);

    res.json({ ideas: getIdeas(env, project.id), status: "ideas" });
  }));

  // --- 2) Selectionner une idee ---
  router.post("/projects/:id/select-idea", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");
    const parsed = selectIdeaSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Donnees invalides");

    const idea = dbQuery(env, "SELECT id FROM ideas WHERE id = ? AND project_id = ?", [parsed.data.ideaId, project.id]).get();
    if (!idea) throw new ApiError(404, "Idee introuvable");

    dbQuery(env, "UPDATE projects SET selected_idea_id = ? WHERE id = ?", [parsed.data.ideaId, project.id]).run();
    touchUpdated(env, project.id);
    res.json({ ok: true });
  }));

  // --- 3) Generer le SCRIPT (depuis l'idee selectionnee, ou le topic si mode manual) ---
  router.post("/projects/:id/script", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");

    const ideaText = project.selected_idea_id
      ? (dbQuery(env, "SELECT idea_text FROM ideas WHERE id = ? AND project_id = ?", [project.selected_idea_id, project.id]).get() as { idea_text: string } | undefined)?.idea_text
      : project.topic;
    if (!ideaText) throw new ApiError(400, "Selectionnez d'abord une idee");

    const config = loadConfig();
    const llm = createLlm(config);
    const raw = await llm.complete(messagesScript({ idea: ideaText, language: config.language }));
    const script = extractJson<ScriptResult>(raw);

    dbQuery(env, "DELETE FROM scripts WHERE project_id = ?", [project.id]).run();
    const info = dbQuery(env, "INSERT INTO scripts (project_id, script_json) VALUES (?, ?)", [project.id, JSON.stringify(script)]).run();
    dbQuery(env, "UPDATE projects SET status = 'script', selected_script_id = ? WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
    touchUpdated(env, project.id);

    res.json({ script, scripts: getScripts(env, project.id), status: "script" });
  }));

  // --- 4) Valider un script ---
  router.post("/projects/:id/validate-script", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");
    const parsed = scriptActionSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Donnees invalides");

    const script = dbQuery(env, "SELECT id FROM scripts WHERE id = ? AND project_id = ?", [parsed.data.scriptId, project.id]).get();
    if (!script) throw new ApiError(404, "Script introuvable");

    dbQuery(env, "UPDATE scripts SET validated = 1 WHERE id = ?", [parsed.data.scriptId]).run();
    dbQuery(env, "UPDATE projects SET selected_script_id = ? WHERE id = ?", [parsed.data.scriptId, project.id]).run();
    touchUpdated(env, project.id);
    res.json({ ok: true });
  }));

  // --- 5) Generer la VOIX (Edge TTS) ---
  router.post("/projects/:id/voice", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");

    const parsed = voiceSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Donnees invalides");

    const scriptId = project.selected_script_id ?? (getScripts(env, project.id)[0]?.id ?? null);
    const scriptRow = scriptId
      ? (dbQuery(env, "SELECT script_json, validated FROM scripts WHERE id = ? AND project_id = ?", [scriptId, project.id]).get() as { script_json: string; validated: number } | undefined)
      : undefined;
    if (!scriptRow) throw new ApiError(400, "Generez d'abord puis validez un script");

    const script = JSON.parse(scriptRow.script_json) as ScriptResult;
    const config = loadConfig();
    const voiceName = parsed.data.voiceName ?? config.edgeVoice;

    const dir = path.resolve(config.outputDir, "projects", String(project.id));
    const fileName = `voix_${Date.now()}.mp3`;
    const filePath = path.join(dir, fileName);

    const { wordBoundaries } = await syntheseVoix(script.texte_continu, {
      voice: voiceName,
      outputPath: filePath,
    });
    const duration = await probeDuration(filePath);

    const info = dbQuery(
      env,
      "INSERT INTO voices (project_id, script_id, voice_name, file_name, duration) VALUES (?, ?, ?, ?, ?)",
      [project.id, scriptId, voiceName, fileName, duration],
    ).run();
    dbQuery(env, "UPDATE projects SET status = 'voice', selected_voice_id = ? WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
    touchUpdated(env, project.id);

    const voice = getVoices(env, project.id).find((v) => v.id === Number(info.lastInsertRowid));
    res.status(201).json({ voice, duration, wordBoundaries, status: "voice" });
  }));

  // --- 6) Lister les voix FR pour choix ---
  router.get("/voices", asyncHandler(async (_req, res) => {
    const voix = await listerVoixFr();
    res.json({ voices: voix });
  }));

  return router;
}
