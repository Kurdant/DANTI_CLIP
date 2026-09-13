import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerEnv } from "../lib/env.js";
import { dbQuery, asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { selectIdeaSchema, scriptActionSchema, voiceSchema, projectRenderOptionsSchema } from "../validate/schemas.js";
import { getProjectRow, getIdeas, getScripts, getVoices, getVideos } from "../lib/serialize.js";
import { resolveBackgroundAbs } from "../lib/backgrounds.js";
import { pickMusic } from "../lib/music.js";
import { pickSfx, resolveSfxAbs } from "../lib/sfx.js";
import { uniqueVideoName } from "../lib/videoprocess.js";
import { loadConfig } from "../../../src/config.js";
import { createLlm, extractJson } from "../../../src/llm/index.js";
import { type IdeasResult, type ScriptResult } from "../../../src/prompts.js";
import { getVideoType } from "../../../src/videoTypes.js";
import { syntheseVoix, listerVoix } from "../../../src/voice.js";
import { ttsRemainingChars, ttsRecordChars } from "../lib/ttsQuota.js";
import { buildAss, assForStyle, buildHookIntroAss, TEXT_STYLES, type TextStyle, type WordBoundaryLike } from "../../../src/subs.js";
import { extractHighlights } from "../../../src/overlays.js";
import { fetchPartImages } from "../../../src/images.js";
import { rendreVideo, type PartImage } from "../../../src/montage.js";

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

/** Sujets deja traites par l'utilisateur (anti-repetition) : passes a l'IA comme interdits. */
function getUsedTopics(env: ServerEnv, userId: number): string[] {
  const rows = dbQuery(
    env,
    "SELECT topic FROM user_topics WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  ).all() as { topic: string }[];
  // Limite pour ne pas gonfler le contexte du prompt (les plus recents d'abord).
  return rows.map((r) => String(r.topic)).filter(Boolean).slice(0, 200);
}

/** Enregistre les sujets generes comme "deja traites" (sans doublon). */
function recordTopics(env: ServerEnv, userId: number, topics: string[]): void {
  const ins = dbQuery(env, "INSERT OR IGNORE INTO user_topics (user_id, topic) VALUES (?, ?)");
  for (const t of topics) {
    const clean = String(t ?? "").trim();
    if (clean) ins.run(userId, clean.slice(0, 500));
  }
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
  video_type: string;
  music_enabled?: number | null;
  music_track?: string | null;
  music_volume?: number | null;
  sfx_enabled?: number | null;
  sfx_intro?: string | null;
  sfx_volume?: number | null;
  effects_enabled?: number | null;
  broll_enabled?: number | null;
  voice_rate?: number | null;
  voice_pitch?: number | null;
}
interface JobState { step: string; progress: number; running: boolean; error?: string }
type Jobs = Map<number, JobState>;

/** Convertit un nombre en prosodie Edge TTS : 8 -> "+8%", -2 -> "-2Hz". */
export function toRate(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n)}%`;
}
export function toPitch(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n)}Hz`;
}

/**
 * Synthese vocale avec quota mensuel Google TTS (garde-fou anti-facturation).
 * Bloque avant d'atteindre le plafond gratuit ; enregistre apres chaque succes.
 */
async function syntheseVoixQuota(
  env: ServerEnv,
  texte: string,
  opts: { voice: string; outputPath: string; rate?: string; pitch?: string },
): Promise<{ mp3Path: string; wordBoundaries: import("edge-tts-universal").WordBoundary[] }> {
  const isGoogle = Boolean(process.env.GOOGLE_TTS_API_KEY);
  if (isGoogle && ttsRemainingChars(env) < texte.length) {
    throw new Error("Monthly voice quota reached (Google TTS free tier). Try again next month.");
  }
  const result = await syntheseVoix(texte, opts);
  if (isGoogle) ttsRecordChars(env, texte.length);
  return result;
}

async function startVideoRender(env: ServerEnv, project: ProjectRowLite, jobs: Jobs = new Map()): Promise<number> {
  const key = project.id;
  jobs.set(key, { step: "rendering", progress: 0, running: true });
  try {
    const voiceRow = project.selected_voice_id
      ? dbQuery(env, "SELECT id, script_id, file_name, subs_file, wb_file, duration FROM voices WHERE id = ? AND project_id = ?", [project.selected_voice_id, project.id]).get() as Record<string, unknown> | undefined
      : undefined;
    if (!voiceRow) throw new Error("No voice: generate the voice first (step 3)");

    const config = loadConfig();
    const llm = createLlm(config);
    const dir = path.resolve(config.outputDir, "projects", String(project.id));
    const audioAbs = path.join(dir, String(voiceRow.file_name));

    // Mascotte (PNG) du compte utilisateur : incrustee en bas si presente, sinon rien.
    // Chemin ABSOLU : ffmpeg tourne avec cwd=dossier projet, un chemin relatif serait introuvable.
    let mascot: string | null = null;
    const userMascot = path.resolve(env.userMascotsDir, String(project.user_id), "mascot.png");
    if (fsExistsSync(userMascot)) mascot = userMascot;

    const scriptRow = voiceRow.script_id
      ? dbQuery(env, "SELECT script_json FROM scripts WHERE id = ? AND project_id = ?", [Number(voiceRow.script_id), project.id]).get() as { script_json: string } | undefined
      : undefined;
    let script: ScriptResult | null = null;
    try { script = scriptRow ? (JSON.parse(scriptRow.script_json) as ScriptResult) : null; } catch { script = null; }
    const text = script?.texte_continu ?? "";
    // Publication YouTube : titre (card projet + nom du fichier), description + hashtags.
    const titreYoutube = (script?.titre_youtube?.trim() || script?.titre?.trim() || project.title || "Short DANTI CLIPER").slice(0, 100);
    const description = (script?.description?.trim() || project.topic || "").slice(0, 5000);
    const hashtags = (Array.isArray(script?.hashtags)
      ? script.hashtags.map(String).map((t) => t.replace(/^#/, "").trim()).filter(Boolean)
      : []).slice(0, 30);

    let wb: unknown = null;
    if (voiceRow.wb_file && fsExistsSync(path.join(dir, String(voiceRow.wb_file)))) {
      try { wb = JSON.parse(fs.readFileSync(path.join(dir, String(voiceRow.wb_file)), "utf8")); } catch { wb = null; }
    }

    // Fond selectionne (sinon fond uni). Utilisateur d'abord, puis fonds par defaut.
    let bgVideoAbs: string | null = null;
    if (project.selected_background) {
      bgVideoAbs = resolveBackgroundAbs(env, project.user_id, project.selected_background);
    }

    // Musique de fond (si activee, piste choisie ou aleatoire) + effets + b-roll video.
    const musicAbs = Number(project.music_enabled ?? 0) === 1 ? pickMusic(env, project.music_track) : null;
    const musicVolume = project.music_volume != null ? Math.max(0, Math.min(1, Number(project.music_volume))) : undefined;
    const effects = Number(project.effects_enabled ?? 1) === 1;
    const broll = Number(project.broll_enabled ?? 1) === 1;

    // Regenerer les sous-titres selon le style choisi (+ overlays highlights).
    const audioDuration = voiceRow.duration != null ? Number(voiceRow.duration) : undefined;
    const angle = project.selected_idea_id
      ? (dbQuery(env, "SELECT angle FROM ideas WHERE id = ? AND project_id = ?", [project.selected_idea_id, project.id]).get() as { angle: string | null } | undefined)?.angle ?? undefined
      : undefined;
    const highlights = script && wb ? extractHighlights(script, wb as never, audioDuration ?? 0) : [];

    // Sound effects (si actives) : impact au debut + "ding" sur chaque chiffre cle.
    let sfx: { file: string; atMs: number; volume: number }[] | undefined;
    if (Number(project.sfx_enabled ?? 1) === 1) {
      // Son d'intro : celui choisi par l'utilisateur (sfx_intro), sinon auto par nom.
      let intro: string | null = null;
      if (project.sfx_intro) intro = resolveSfxAbs(env, project.sfx_intro);
      if (!intro) intro = pickSfx(env, /whoosh|boom|impact|intro|start|swish|swoosh|transition/i);
      const ding = pickSfx(env, /ding|pop|tick|click|hit|beep|chime|punch/i, intro ? intro.split("/").pop() ?? undefined : undefined);
      if (intro || ding) {
        const volMult = project.sfx_volume != null ? Math.max(0, Math.min(1, Number(project.sfx_volume))) : 1;
        sfx = [];
        if (intro) sfx.push({ file: intro, atMs: 50, volume: 0.55 * volMult });
        if (ding) {
          const hits = highlights.filter((h) => h.kind === "number").slice(0, 5);
          for (const h of hits) sfx.push({ file: ding, atMs: Math.round((h.start + 0.02) * 1000), volume: 0.35 * volMult });
        }
      }
    }
    const subsName = String(voiceRow.subs_file || `caps_${Date.now()}.ass`);
    // Type "test" (bac a sable) : karaoke mot-a-mot par defaut.
    const isTestType = project.video_type === "test";
    const effectiveStyle: TextStyle = isTestType ? "karaoke" : ((project.text_style as TextStyle) || "classic");

    // Intro "test" : gros hook ROUGE en haut (revele mot a mot) + mascotte agrandie.
    // Une fois le hook fini, la mascotte et le texte reviennent au format normal.
    const wbArr = (wb ?? null) as WordBoundaryLike[] | null;
    let hookFile: string | null = null;
    let mascotIntroEnd: number | null = null;
    if (isTestType && script?.hook) {
      const hookIntro = buildHookIntroAss(script.hook, wbArr);
      mascotIntroEnd = hookIntro.end;
      hookFile = `hook_${Date.now()}.ass`;
      await writeFile(path.join(dir, hookFile), hookIntro.ass, "utf8");
    }

    // Pendant le hook, les sous-titres normaux sont masques (le gros texte rouge
    // les remplace) ; ils reprennent juste apres la fin du hook.
    const wbCaps = mascotIntroEnd
      ? wbArr?.filter((b) => b.offset / 1e7 >= mascotIntroEnd! - 0.02) ?? null
      : wbArr;

    const ass = assForStyle(effectiveStyle, {
      wordBoundaries: wbCaps as never,
      text,
      durationSec: audioDuration,
      highlights,
    });
    await writeFile(path.join(dir, subsName), ass, "utf8");

    // Piste B : images d'illustration par partie (si cle Pexels). Sinon fond degrade.
    let images: PartImage[] | undefined;
    if (env.pexelsApiKey && script) {
      try {
        const idea = project.selected_idea_id
          ? (dbQuery(env, "SELECT idea_text, fond FROM ideas WHERE id = ? AND project_id = ?", [project.selected_idea_id, project.id]).get() as { idea_text: string; fond: string | null } | undefined)
          : undefined;
        images = await fetchPartImages({
          apiKey: env.pexelsApiKey,
          script,
          idea: idea ? { sujet: idea.idea_text, fond: idea.fond ?? undefined } : null,
          durationSec: audioDuration ?? 0,
          renderDir: dir,
          wordBoundaries: wb as never,
          llm,
          allowVideos: broll,
        });
      } catch (e) {
        console.error("[video] Pexels images failed, gradient fallback:", e);
        images = undefined;
      }
    }

    // Type "test" : aucune image pendant le hook (le gros texte rouge occupe le
    // haut). Les images reprennent une fois le hook fini.
    if (images && mascotIntroEnd) {
      images = images
        .filter((im) => im.end > mascotIntroEnd!)
        .map((im) => ({ ...im, start: Math.max(im.start, mascotIntroEnd!) }));
    }

    const outName = uniqueVideoName(dir, titreYoutube);
    await rendreVideo(
      {
        renderDir: dir,
        bgVideoAbs,
        audioAbs,
        subsFile: path.basename(subsName),
        outName,
        expectedDuration: audioDuration,
        angle,
        images,
        mascot,
        hookFile,
        mascotIntroEnd,
        musicAbs,
        musicVolume,
        effects,
        sfx,
      },
      (f) => {
        const j = jobs.get(key);
        if (j) { j.progress = f; j.step = "rendering"; }
      },
    );
    const duration = await probeDuration(path.join(dir, outName));
    const info = dbQuery(
      env,
      "INSERT INTO videos (project_id, file_name, duration, title, description, tags) VALUES (?, ?, ?, ?, ?, ?)",
      [project.id, outName, duration, titreYoutube, description, JSON.stringify(hashtags)],
    ).run();
    // Purge des anciennes videos non gardees du projet : seules celles en bibliotheque survivent.
    const oldVids = dbQuery(
      env,
      "SELECT id, file_name FROM videos WHERE project_id = ? AND kept = 0 AND id != ?",
      [project.id, Number(info.lastInsertRowid)],
    ).all() as { id: number; file_name: string }[];
    for (const o of oldVids) {
      try { fs.rmSync(path.join(dir, o.file_name), { force: true }); } catch { /* absent */ }
      dbQuery(env, "DELETE FROM videos WHERE id = ?", [o.id]).run();
    }
    // Le titre genere devient le titre de la card projet.
    dbQuery(env, "UPDATE projects SET title = ?, status = 'done' WHERE id = ?", [titreYoutube, project.id]).run();
    touchUpdated(env, project.id);
    jobs.set(key, { step: "done", progress: 1, running: false });
    return Number(info.lastInsertRowid);
  } catch (e) {
    console.error("[video] render error:", e);
    jobs.set(key, { step: "error", progress: 0, running: false, error: "Error while rendering the video" });
    throw e;
  }
}

async function runFullCreation(env: ServerEnv, project: ProjectRowLite, jobs: Jobs = new Map(), requestedVoice?: string, voiceRate?: string, voicePitch?: string): Promise<number> {
  const key = project.id;
  const setJob = (step: string, progress: number) => jobs.set(key, { step, progress, running: true });
  setJob("preparation", 0.02);
  try {
    const config = loadConfig();
    const llm = createLlm(config);

    // 1) IDEES (si auto et aucune)
    if (project.mode === "auto" && getIdeas(env, project.id).length === 0) {
      setJob("ideas", 0.08);
      const usedTopics = getUsedTopics(env, project.user_id);
      const raw = await llm.complete(getVideoType(project.video_type).messagesIdees({ topic: project.topic, nIdeas: config.nIdeas, language: config.language, usedTopics }));
      const { idees } = extractJson<IdeasResult>(raw);
      dbQuery(env, "DELETE FROM ideas WHERE project_id = ?", [project.id]).run();
      const ins = dbQuery(env, "INSERT INTO ideas (project_id, position, idea_text, titre, hook, angle, fond) VALUES (?, ?, ?, ?, ?, ?, ?)");
      idees.forEach((id, i) => ins.run(project.id, i + 1, id.sujet, id.titre ?? null, id.hook ?? null, id.angle ?? null, id.fond ?? null));
      recordTopics(env, project.user_id, idees.map((id) => id.sujet));
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
      const raw = await llm.complete(getVideoType(project.video_type).messagesScript({ idea: ideaText, language: config.language }));
      const script = extractJson<ScriptResult>(raw);
      const info = dbQuery(env, "INSERT INTO scripts (project_id, script_json) VALUES (?, ?)", [project.id, JSON.stringify(script)]).run();
      dbQuery(env, "UPDATE projects SET status = 'script', selected_script_id = ? WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
      proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    }

    // 4) VOIX
    if (getVoices(env, project.id).length === 0) {
      setJob("voice", 0.55);
      const scriptId = proj.selected_script_id ?? (getScripts(env, project.id)[0]?.id ?? null);
      const scriptRow = scriptId
        ? dbQuery(env, "SELECT script_json FROM scripts WHERE id = ? AND project_id = ?", [scriptId, project.id]).get() as { script_json: string } | undefined
        : undefined;
      if (scriptRow) {
        const script = JSON.parse(scriptRow.script_json) as ScriptResult;
        const dir = path.resolve(config.outputDir, "projects", String(project.id));
        const fileName = `voix_${Date.now()}.mp3`;
        const voiceName = requestedVoice || config.edgeVoice;
        const { wordBoundaries } = await syntheseVoixQuota(env, script.texte_continu, { voice: voiceName, outputPath: path.join(dir, fileName), rate: voiceRate, pitch: voicePitch });
        const duration = await probeDuration(path.join(dir, fileName));
        const wbName = `wb_${Date.now()}.json`;
        await writeFile(path.join(dir, wbName), JSON.stringify(wordBoundaries));
        const subsName = `caps_${Date.now()}.ass`;
        await writeFile(path.join(dir, subsName), assForStyle((proj.text_style as TextStyle) || "classic", { wordBoundaries, text: script.texte_continu, durationSec: duration ?? undefined }), "utf8");
        const info = dbQuery(env, "INSERT INTO voices (project_id, script_id, voice_name, file_name, subs_file, wb_file, duration, rate, pitch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [project.id, scriptId, voiceName, fileName, subsName, wbName, duration, voiceRate ?? null, voicePitch ?? null]).run();
        dbQuery(env, "UPDATE projects SET status = 'voice', selected_voice_id = ? WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
      }
      proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    }

    // 5) VIDEO (async avec progression)
    proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    setJob("rendering", 0.8);
    return await startVideoRender(env, proj, jobs);
  } catch (e) {
    console.error("[full] error:", e);
    jobs.set(key, { step: "error", progress: 0, running: false, error: "Error during full creation" });
    throw e;
  }
}

export function workflowRouter(env: ServerEnv): Router {
  const router = Router();

  // --- 1) Generer les IDEES ---
  router.post("/projects/:id/ideas", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");

    const config = loadConfig();
    const llm = createLlm(config);
    const usedTopics = getUsedTopics(env, req.auth!.userId);
    const raw = await llm.complete(
      getVideoType(project.video_type).messagesIdees({ topic: project.topic, nIdeas: config.nIdeas, language: config.language, usedTopics }),
    );
    const { idees } = extractJson<IdeasResult>(raw);

    // Vide les anciennes idees (regeneration) puis insere.
    dbQuery(env, "DELETE FROM ideas WHERE project_id = ?", [project.id]).run();
    const insert = dbQuery(env, "INSERT INTO ideas (project_id, position, idea_text, titre, hook, angle, fond) VALUES (?, ?, ?, ?, ?, ?, ?)");
    idees.forEach((id, i) => {
      insert.run(project.id, i + 1, id.sujet, id.titre ?? null, id.hook ?? null, id.angle ?? null, id.fond ?? null);
    });
    recordTopics(env, req.auth!.userId, idees.map((id) => id.sujet));
    dbQuery(env, "UPDATE projects SET status = 'ideas' WHERE id = ?", [project.id]).run();
    touchUpdated(env, project.id);

    res.json({ ideas: getIdeas(env, project.id), status: "ideas" });
  }));

  // --- 2) Selectionner une idee ---
  router.post("/projects/:id/select-idea", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    const parsed = selectIdeaSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");

    const idea = dbQuery(env, "SELECT id FROM ideas WHERE id = ? AND project_id = ?", [parsed.data.ideaId, project.id]).get();
    if (!idea) throw new ApiError(404, "Idea not found");

    dbQuery(env, "UPDATE projects SET selected_idea_id = ? WHERE id = ?", [parsed.data.ideaId, project.id]).run();
    touchUpdated(env, project.id);
    res.json({ ok: true });
  }));

  // --- 3) Generer le SCRIPT (depuis l'idee selectionnee, ou le topic si mode manual) ---
  router.post("/projects/:id/script", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");

    const ideaText = project.selected_idea_id
      ? (dbQuery(env, "SELECT idea_text FROM ideas WHERE id = ? AND project_id = ?", [project.selected_idea_id, project.id]).get() as { idea_text: string } | undefined)?.idea_text
      : project.topic;
    if (!ideaText) throw new ApiError(400, "Select an idea first");

    const config = loadConfig();
    const llm = createLlm(config);
    const raw = await llm.complete(getVideoType(project.video_type).messagesScript({ idea: ideaText, language: config.language }));
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
    if (!project) throw new ApiError(404, "Project not found");
    const parsed = scriptActionSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");

    const script = dbQuery(env, "SELECT id FROM scripts WHERE id = ? AND project_id = ?", [parsed.data.scriptId, project.id]).get();
    if (!script) throw new ApiError(404, "Script not found");

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
    if (!project) throw new ApiError(404, "Project not found");

    const parsed = voiceSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");

    const scriptId = project.selected_script_id ?? (getScripts(env, project.id)[0]?.id ?? null);
    const scriptRow = scriptId
      ? (dbQuery(env, "SELECT script_json, validated FROM scripts WHERE id = ? AND project_id = ?", [scriptId, project.id]).get() as { script_json: string; validated: number } | undefined)
      : undefined;
    if (!scriptRow) throw new ApiError(400, "Generate and validate a script first");

    const script = JSON.parse(scriptRow.script_json) as ScriptResult;
    const config = loadConfig();
    const voiceName = parsed.data.voiceName ?? config.edgeVoice;
    const rate = parsed.data.rate != null ? toRate(parsed.data.rate) : undefined;
    const pitch = parsed.data.pitch != null ? toPitch(parsed.data.pitch) : undefined;

    const dir = path.resolve(config.outputDir, "projects", String(project.id));
    const fileName = `voix_${Date.now()}.mp3`;
    const filePath = path.join(dir, fileName);

    const { wordBoundaries } = await syntheseVoixQuota(env, script.texte_continu, {
      voice: voiceName,
      outputPath: filePath,
      rate,
      pitch,
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
      "INSERT INTO voices (project_id, script_id, voice_name, file_name, subs_file, wb_file, duration, rate, pitch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [project.id, scriptId, voiceName, fileName, subsName, wbName, duration, rate ?? null, pitch ?? null],
    ).run();
    dbQuery(env, "UPDATE projects SET status = 'voice', selected_voice_id = ?, voice_rate = ?, voice_pitch = ? WHERE id = ?", [Number(info.lastInsertRowid), parsed.data.rate ?? null, parsed.data.pitch ?? null, project.id]).run();
    touchUpdated(env, project.id);

    const voice = getVoices(env, project.id).find((v) => v.id === Number(info.lastInsertRowid));
    res.status(201).json({ voice, duration, status: "voice" });
  }));

  // --- 5a) Choisir le STYLE DE SOUS-TITRES ---
  router.post("/projects/:id/style", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    const style = String(req.body?.style ?? "");
    if (!ALL_STYLES.includes(style)) throw new ApiError(400, "Invalid style");
    dbQuery(env, "UPDATE projects SET text_style = ? WHERE id = ?", [style, project.id]).run();
    touchUpdated(env, project.id);
    res.json({ ok: true, textStyle: style });
  }));

  // --- 5bis) GENERER LA VIDEO (fond + sous-titres + voix) : rendu async + progression ---
  router.post("/projects/:id/video", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    startVideoRender(env, project, renderJobs);
    res.status(202).json({ started: true });
  }));

  // --- 5ter) PROGRESSION du rendu ---
  router.get("/projects/:id/video/status", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    const job = renderJobs.get(project.id);
    res.json(job ?? { step: "idle", progress: 0, running: false });
  }));

  // --- 5sexies) Enregistrer les options de rendu (style, musique, effets, b-roll, voix) ---
  router.patch("/projects/:id/render-options", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    const parsed = projectRenderOptionsSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");
    const d = parsed.data;
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };
    if (d.textStyle !== undefined) push("text_style", d.textStyle);
    if (d.musicEnabled !== undefined) push("music_enabled", d.musicEnabled ? 1 : 0);
    if (d.musicTrack !== undefined) push("music_track", d.musicTrack ?? null);
    if (d.musicVolume !== undefined) push("music_volume", d.musicVolume);
    if (d.sfxEnabled !== undefined) push("sfx_enabled", d.sfxEnabled ? 1 : 0);
    if (d.sfxIntro !== undefined) push("sfx_intro", d.sfxIntro ?? null);
    if (d.sfxVolume !== undefined) push("sfx_volume", d.sfxVolume);
    if (d.effectsEnabled !== undefined) push("effects_enabled", d.effectsEnabled ? 1 : 0);
    if (d.brollEnabled !== undefined) push("broll_enabled", d.brollEnabled ? 1 : 0);
    if (d.voiceRate !== undefined) push("voice_rate", d.voiceRate);
    if (d.voicePitch !== undefined) push("voice_pitch", d.voicePitch);
    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      params.push(project.id);
      dbQuery(env, `UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, params).run();
    }
    res.json({ ok: true });
  }));

  // --- 5quater) FULL CREATION : tout enchainé d'un coup ---
  router.post("/projects/:id/full", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    const body = (req.body ?? {}) as { voiceName?: string; voiceRate?: number; voicePitch?: number };
    const voiceName = typeof body.voiceName === "string" && body.voiceName ? body.voiceName : undefined;
    const rate = typeof body.voiceRate === "number" ? toRate(body.voiceRate) : undefined;
    const pitch = typeof body.voicePitch === "number" ? toPitch(body.voicePitch) : undefined;
    runFullCreation(env, project as unknown as ProjectRowLite, renderJobs, voiceName, rate, pitch).catch(() => undefined);
    res.status(202).json({ started: true });
  }));

  // --- 5quinquies) Lister les voix pour choix (selon la langue de config) ---
  router.get("/voices", asyncHandler(async (_req, res) => {
    const config = loadConfig();
    const voix = await listerVoix(config.language);
    res.json({ voices: voix });
  }));

  return router;
}

// ------------------------------------------------------------
// Generation reutilisable (hors HTTP) : utilisee par le scheduler
// d'automatisation. Retourne l'id de la video produite.
// ------------------------------------------------------------

/** Resout un projet par id, sans filtre utilisateur (pour le scheduler). */
function getProjectById(env: ServerEnv, projectId: number): ProjectRowLite | null {
  const row = dbQuery(env, "SELECT * FROM projects WHERE id = ?", [projectId]).get() as ProjectRowLite | undefined;
  return row ?? null;
}

/**
 * Genere une video de bout en bout (idees -> script -> voix -> video) pour un
 * projet en mode auto, sans passer par HTTP. Retourne l'id de la video produite.
 */
export async function generateProject(
  env: ServerEnv,
  projectId: number,
  opts?: { voiceName?: string; rate?: string; pitch?: string },
): Promise<number> {
  const project = getProjectById(env, projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  return runFullCreation(env, project, new Map(), opts?.voiceName, opts?.rate, opts?.pitch);
}
