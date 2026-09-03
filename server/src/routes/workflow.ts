import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerEnv } from "../lib/env.js";
import { dbQuery, asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { selectIdeaSchema, scriptActionSchema, voiceSchema } from "../validate/schemas.js";
import { getProjectRow, getIdeas, getScripts, getVoices, getVideos } from "../lib/serialize.js";
import { resolveWithin } from "../lib/fspath.js";
import { loadConfig } from "../../../src/config.js";
import { createLlm, extractJson } from "../../../src/llm/index.js";
import { messagesIdees, messagesScript, type IdeasResult, type ScriptResult } from "../../../src/prompts.js";
import { syntheseVoix, listerVoixFr } from "../../../src/voice.js";
import { buildAss, assForStyle, TEXT_STYLES, type TextStyle } from "../../../src/subs.js";
import { rendreVideo } from "../../../src/montage.js";

const fsExistsSync = (p: string) => fs.existsSync(p);

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

interface ProjectRowLite {
  id: number;
  user_id: number;
  title: string;
  topic: string;
  mode: string;
  status: string;
  selected_idea_id: number | null;
  selected_script_id: number | null;
  selected_voice_id: number | null;
  selected_background: string | null;
  text_style: string;
}
interface JobState { step: string; progress: number; running: boolean; error?: string }
type Jobs = Map<number, JobState>;

async function startVideoRender(env: ServerEnv, project: ProjectRowLite, jobs: Jobs): Promise<void> {
  const key = project.id;
  jobs.set(key, { step: "rendu", progress: 0, running: true });
  try {
    const voiceRow = project.selected_voice_id
      ? dbQuery(env, "SELECT id, script_id, file_name, subs_file, wb_file, duration FROM voices WHERE id = ? AND project_id = ?", [project.selected_voice_id, project.id]).get() as Record<string, unknown> | undefined
      : undefined;
    if (!voiceRow) throw new Error("Aucune voix : genere d'abord la voix (etape 3)");

    const config = loadConfig();
    const dir = path.resolve(config.outputDir, "projects", String(project.id));
    const audioAbs = path.join(dir, String(voiceRow.file_name));

    const scriptRow = voiceRow.script_id
      ? dbQuery(env, "SELECT script_json FROM scripts WHERE id = ? AND project_id = ?", [Number(voiceRow.script_id), project.id]).get() as { script_json: string } | undefined
      : undefined;
    const text = scriptRow ? (JSON.parse(scriptRow.script_json) as ScriptResult).texte_continu : "";

    let wb: unknown = null;
    if (voiceRow.wb_file && fsExistsSync(path.join(dir, String(voiceRow.wb_file)))) {
      try { wb = JSON.parse(fs.readFileSync(path.join(dir, String(voiceRow.wb_file)), "utf8")); } catch { wb = null; }
    }

    // Fond selectionne (sinon fond uni).
    let bgVideoAbs: string | null = null;
    if (project.selected_background) {
      const bgPath = resolveWithin(env.backgroundsDir, project.selected_background);
      if (bgPath && fsExistsSync(bgPath)) bgVideoAbs = bgPath;
    }

    // Regenerer les sous-titres selon le style choisi.
    const subsName = String(voiceRow.subs_file || `caps_${Date.now()}.ass`);
    const ass = assForStyle((project.text_style as TextStyle) || "classic", {
      wordBoundaries: wb as never,
      text,
      durationSec: voiceRow.duration != null ? Number(voiceRow.duration) : undefined,
    });
    await writeFile(path.join(dir, subsName), ass, "utf8");

    const outName = `video_${Date.now()}.mp4`;
    await rendreVideo(
      {
        renderDir: dir,
        bgVideoAbs,
        audioAbs,
        subsFile: path.basename(subsName),
        outName,
        expectedDuration: voiceRow.duration != null ? Number(voiceRow.duration) : undefined,
      },
      (f) => {
        const j = jobs.get(key);
        if (j) { j.progress = f; j.step = "rendu"; }
      },
    );
    const duration = await probeDuration(path.join(dir, outName));
    const info = dbQuery(env, "INSERT INTO videos (project_id, file_name, duration) VALUES (?, ?, ?)", [project.id, outName, duration]).run();
    dbQuery(env, "UPDATE projects SET status = 'done' WHERE id = ?", [project.id]).run();
    touchUpdated(env, project.id);
    jobs.set(key, { step: "done", progress: 1, running: false });
  } catch (e) {
    jobs.set(key, { step: "error", progress: 0, running: false, error: e instanceof Error ? e.message : "Erreur rendu" });
  }
}

async function runFullCreation(env: ServerEnv, project: ProjectRowLite, jobs: Jobs, requestedVoice?: string): Promise<void> {
  const key = project.id;
  const setJob = (step: string, progress: number) => jobs.set(key, { step, progress, running: true });
  setJob("preparation", 0.02);
  try {
    const config = loadConfig();
    const llm = createLlm(config);

    // 1) IDEES (si auto et aucune)
    if (project.mode === "auto" && getIdeas(env, project.id).length === 0) {
      setJob("idees", 0.08);
      const raw = await llm.complete(messagesIdees({ topic: project.topic, nIdeas: config.nIdeas, language: config.language }));
      const { idees } = extractJson<IdeasResult>(raw);
      dbQuery(env, "DELETE FROM ideas WHERE project_id = ?", [project.id]).run();
      const ins = dbQuery(env, "INSERT INTO ideas (project_id, position, idea_text, titre, hook, angle, fond) VALUES (?, ?, ?, ?, ?, ?, ?)");
      idees.forEach((id, i) => ins.run(project.id, i + 1, id.sujet, id.titre ?? null, id.hook ?? null, id.angle ?? null, id.fond ?? null));
    }

    // 2) selectionner la meilleure idee (premiere) si auto
    let proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    const ideasNow = getIdeas(env, project.id);
    if (proj.mode === "auto" && ideasNow.length > 0 && !proj.selected_idea_id) {
      dbQuery(env, "UPDATE projects SET selected_idea_id = ? WHERE id = ?", [ideasNow[0].id, project.id]).run();
      proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    }

    // 3) SCRIPT
    if (getScripts(env, project.id).length === 0) {
      setJob("script", 0.25);
      const ideaText = proj.selected_idea_id
        ? ((dbQuery(env, "SELECT idea_text FROM ideas WHERE id = ? AND project_id = ?", [proj.selected_idea_id, project.id]).get() as { idea_text: string } | undefined)?.idea_text ?? proj.topic)
        : proj.topic;
      const raw = await llm.complete(messagesScript({ idea: ideaText, language: config.language }));
      const script = extractJson<ScriptResult>(raw);
      const info = dbQuery(env, "INSERT INTO scripts (project_id, script_json) VALUES (?, ?)", [project.id, JSON.stringify(script)]).run();
      dbQuery(env, "UPDATE projects SET status = 'script', selected_script_id = ? WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
      proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    }

    // 4) VOIX
    if (getVoices(env, project.id).length === 0) {
      setJob("voix", 0.55);
      const scriptId = proj.selected_script_id ?? (getScripts(env, project.id)[0]?.id ?? null);
      const scriptRow = scriptId
        ? dbQuery(env, "SELECT script_json FROM scripts WHERE id = ? AND project_id = ?", [scriptId, project.id]).get() as { script_json: string } | undefined
        : undefined;
      if (scriptRow) {
        const script = JSON.parse(scriptRow.script_json) as ScriptResult;
        const dir = path.resolve(config.outputDir, "projects", String(project.id));
        const fileName = `voix_${Date.now()}.mp3`;
        const voiceName = requestedVoice || config.edgeVoice;
        const { wordBoundaries } = await syntheseVoix(script.texte_continu, { voice: voiceName, outputPath: path.join(dir, fileName) });
        const duration = await probeDuration(path.join(dir, fileName));
        const wbName = `wb_${Date.now()}.json`;
        await writeFile(path.join(dir, wbName), JSON.stringify(wordBoundaries));
        const subsName = `caps_${Date.now()}.ass`;
        await writeFile(path.join(dir, subsName), assForStyle((proj.text_style as TextStyle) || "classic", { wordBoundaries, text: script.texte_continu, durationSec: duration ?? undefined }), "utf8");
        const info = dbQuery(env, "INSERT INTO voices (project_id, script_id, voice_name, file_name, subs_file, wb_file, duration) VALUES (?, ?, ?, ?, ?, ?, ?)", [project.id, scriptId, voiceName, fileName, subsName, wbName, duration]).run();
        dbQuery(env, "UPDATE projects SET status = 'voice', selected_voice_id = ? WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
      }
      proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    }

    // 5) VIDEO (async avec progression)
    proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    setJob("rendu", 0.8);
    await startVideoRender(env, proj, jobs);
  } catch (e) {
    jobs.set(key, { step: "error", progress: 0, running: false, error: e instanceof Error ? e.message : "Erreur" });
  }
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
    const insert = dbQuery(env, "INSERT INTO ideas (project_id, position, idea_text, titre, hook, angle, fond) VALUES (?, ?, ?, ?, ?, ?, ?)");
    idees.forEach((id, i) => {
      insert.run(project.id, i + 1, id.sujet, id.titre ?? null, id.hook ?? null, id.angle ?? null, id.fond ?? null);
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

  const renderJobs = new Map<number, { step: string; progress: number; running: boolean; error?: string }>();
  const ALL_STYLES = Object.keys(TEXT_STYLES);

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

    // Stocke les timings (regenerer les sous-titres selon le style choisi plus tard).
    const wbName = `wb_${Date.now()}.json`;
    await writeFile(path.join(dir, wbName), JSON.stringify(wordBoundaries));
    const subsName = `caps_${Date.now()}.ass`;
    const ass = assForStyle((project.text_style as TextStyle) || "classic", {
      wordBoundaries,
      text: script.texte_continu,
      durationSec: duration ?? undefined,
    });
    await writeFile(path.join(dir, subsName), ass, "utf8");

    const info = dbQuery(
      env,
      "INSERT INTO voices (project_id, script_id, voice_name, file_name, subs_file, wb_file, duration) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [project.id, scriptId, voiceName, fileName, subsName, wbName, duration],
    ).run();
    dbQuery(env, "UPDATE projects SET status = 'voice', selected_voice_id = ? WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
    touchUpdated(env, project.id);

    const voice = getVoices(env, project.id).find((v) => v.id === Number(info.lastInsertRowid));
    res.status(201).json({ voice, duration, status: "voice" });
  }));

  // --- 5a) Choisir le STYLE DE SOUS-TITRES ---
  router.post("/projects/:id/style", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");
    const style = String(req.body?.style ?? "");
    if (!ALL_STYLES.includes(style)) throw new ApiError(400, "Style invalide");
    dbQuery(env, "UPDATE projects SET text_style = ? WHERE id = ?", [style, project.id]).run();
    touchUpdated(env, project.id);
    res.json({ ok: true, textStyle: style });
  }));

  // --- 5bis) GENERER LA VIDEO (fond + sous-titres + voix) : rendu async + progression ---
  router.post("/projects/:id/video", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");
    startVideoRender(env, project, renderJobs);
    res.status(202).json({ started: true });
  }));

  // --- 5ter) PROGRESSION du rendu ---
  router.get("/projects/:id/video/status", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");
    const job = renderJobs.get(project.id);
    res.json(job ?? { step: "idle", progress: 0, running: false });
  }));

  // --- 5quater) FULL CREATION : tout enchainé d'un coup ---
  router.post("/projects/:id/full", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Projet introuvable");
    const body = (req.body ?? {}) as { voiceName?: string };
    const voiceName = typeof body.voiceName === "string" && body.voiceName ? body.voiceName : undefined;
    runFullCreation(env, project as unknown as ProjectRowLite, renderJobs, voiceName).catch(() => undefined);
    res.status(202).json({ started: true });
  }));

  // --- 5quinquies) Lister les voix FR pour choix ---
  router.get("/voices", asyncHandler(async (_req, res) => {
    const voix = await listerVoixFr();
    res.json({ voices: voix });
  }));

  return router;
}
