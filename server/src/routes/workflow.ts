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
import { createContentLlms } from "../../../src/llm/index.js";
import { parseLlmJson, ideasResultSchema, scriptResultSchema, type ScriptResultParsed } from "../../../src/llm/schemas.js";
import { type ScriptResult } from "../../../src/prompts.js";
import { getVideoType } from "../../../src/videoTypes.js";
import { syntheseVoix, listerVoix } from "../../../src/voice.js";
import { ttsRemainingChars, ttsRecordChars } from "../lib/ttsQuota.js";
import { buildAss, assForStyle, buildHookIntroAss, TEXT_STYLES, type TextStyle, type WordBoundaryLike } from "../../../src/subs.js";
import { extractHighlights } from "../../../src/overlays.js";
import { fetchPartImages } from "../../../src/images.js";
import { rendreVideo, type PartImage } from "../../../src/montage.js";
import { saveIdeasAsCandidates, selectBestCandidateId, ideaIdForCandidate, markCandidateSelected, candidateForIdea, selectedCandidateForProject, saveHooks, selectBestHookId, bestHookText, markHookSelected, linkVideoCategories, archiveProjectCandidates, hooksForCandidate, candidatesForProject, candidateScoreMap, type IdeaInput, type CandidateRow, type HookRow } from "../lib/contentEngine.js";
import { evaluateTopics, evaluateHooks } from "../../../src/content-engine/evaluator.js";
import { generateHooks, type HookVariant } from "../../../src/content-engine/hooks.js";
import { selectFinalContent, type FinalCandidateInput } from "../../../src/content-engine/final-selection.js";
import { factCheckScript } from "../../../src/content-engine/fact-check.js";
import { loadContentEngineConfig, type HookScoringConfig } from "../../../src/content-engine/config.js";
import { logContentEvent } from "../../../src/content-engine/logging.js";
import { computeAndPersistRecommendation } from "../lib/learning.js";
import type { HookScores } from "../../../src/content-engine/scoring.js";
import type { LlmProvider } from "../../../src/llm/types.js";

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

/** Evalue les idees (juge) et les persiste comme candidats scores. Repli heuristique si l'evaluation echoue. */
async function persistScoredCandidates(
  env: ServerEnv,
  project: ProjectRowLite,
  idees: IdeaInput[],
  judge: LlmProvider,
  language: string,
): Promise<void> {
  let evaluations;
  try {
    evaluations = await evaluateTopics(judge, idees.map((i) => i.sujet ?? i.titre ?? ""), language);
  } catch (e) {
    console.error("[content] evaluation LLM echec, repli heuristique:", e);
    evaluations = undefined;
  }
  saveIdeasAsCandidates(env, project.user_id, project.id, idees, evaluations, loadContentEngineConfig().topicScoring);
}

/** Langue effective d'un compte : regle explicite > config globale (LANGUAGE). */
export function resolveLanguage(env: ServerEnv, userId: number, fallback: string): string {
  const row = dbQuery(env, "SELECT language FROM users WHERE id = ?", [userId]).get() as { language: string | null } | undefined;
  return row?.language?.trim() || fallback;
}

const NEUTRAL_HOOK_SCORES: HookScores = {
  curiosity: 0.6, clarity: 0.6, specificity: 0.6, surprise: 0.6,
  emotionalImpact: 0.6, openLoop: 0.6, credibility: 0.6, scrollStoppingPotential: 0.6,
};

/**
 * Hook Engine : pour un candidat, genere N variantes (generator), les evalue
 * (judge), les persiste et retourne le meilleur hook + la liste des variantes.
 */
async function ensureHooksForCandidate(
  env: ServerEnv,
  candidate: CandidateRow,
  generator: LlmProvider,
  judge: LlmProvider,
  language: string,
  hookConfig: HookScoringConfig,
): Promise<{ bestHookId: number | null; hooks: HookRow[] }> {
  let hookId = selectBestHookId(env, candidate.id);
  if (hookId == null) {
    try {
      const variants: HookVariant[] = await generateHooks(generator, candidate.idea_text, {
        angle: candidate.angle || undefined,
        language,
        count: hookConfig.variantsPerTopic,
      });
      let evaluations;
      try {
        evaluations = await evaluateHooks(judge, variants.map((v) => v.hook_text), language);
      } catch (e) {
        console.error("[content] evaluation hooks LLM echec, scores neutres:", e);
        evaluations = undefined;
      }
      saveHooks(
        env,
        candidate.id,
        variants.map((v, i) => ({
          hook_text: v.hook_text,
          pattern: v.pattern,
          scores: evaluations?.[i]?.scores ?? NEUTRAL_HOOK_SCORES,
          justification: evaluations?.[i]?.justification ?? "evaluation LLM indisponible - scores neutres",
        })),
        hookConfig,
      );
      logContentEvent("HOOK_GENERATED", {
        topicCandidateId: candidate.id,
        data: { count: variants.length },
      });
      hookId = selectBestHookId(env, candidate.id);
    } catch (e) {
      console.error("[content] generation hooks echec, script sans hook fixe:", e);
      return { bestHookId: null, hooks: [] };
    }
  }
  return { bestHookId: hookId, hooks: hooksForCandidate(env, candidate.id) };
}

/**
 * Selection auto (flux Yan) : hooks pour le top K des candidats, puis le juge
 * choisit le couple (candidat, hook) gagnant. Repli deterministe sur le
 * meilleur score si le juge echoue. Persiste la selection (idee + candidat +
 * hook) et retourne le hook retenu.
 */
export async function runAutoContentSelection(
  env: ServerEnv,
  project: ProjectRowLite,
  generator: LlmProvider,
  judge: LlmProvider,
  language: string,
  ceConfig: ReturnType<typeof loadContentEngineConfig>,
): Promise<{ hookId: number | null; hookText: string | null }> {
  const candidates = candidatesForProject(env, project.id)
    .filter((c) => c.status !== "rejected")
    .slice(0, Math.max(1, ceConfig.selection.topKCandidates));
  if (candidates.length === 0) return { hookId: null, hookText: null };

  const bundles = new Map<number, { bestHookId: number | null; hooks: HookRow[] }>();
  for (const c of candidates) {
    bundles.set(c.id, await ensureHooksForCandidate(env, c, generator, judge, language, ceConfig.hookScoring));
  }

  const inputs: FinalCandidateInput[] = candidates.map((c, i) => ({
    index: i + 1,
    title: c.title,
    idea_text: c.idea_text,
    angle: c.angle,
    total: c.total_score ?? 0,
    banality: c.banality_score ?? 0,
    credibility: c.credibility_score ?? 0,
    hooks: (bundles.get(c.id)?.hooks ?? []).map((h, hi) => ({
      index: hi + 1,
      text: h.hook_text,
      pattern: h.pattern,
      total: h.total_score ?? 0,
    })),
  }));

  let chosen = null;
  try {
    chosen = await selectFinalContent(judge, inputs, language);
  } catch (e) {
    console.error("[content] selection finale juge echec, repli deterministe:", e);
  }

  // Repli deterministe : meilleur candidat + meilleur hook de ce candidat.
  let chosenCandidate = candidates[0];
  let chosenHookId = bundles.get(chosenCandidate.id)?.bestHookId ?? null;
  if (chosen) {
    const cand = candidates[chosen.candidateIndex - 1];
    if (cand) {
      chosenCandidate = cand;
      const hook = bundles.get(cand.id)?.hooks[chosen.hookIndex - 1];
      if (hook) chosenHookId = hook.id;
    }
  }

  const chosenIdeaId = ideaIdForCandidate(env, project.id, chosenCandidate.id);
  const ideasNow = getIdeas(env, project.id);
  dbQuery(env, "UPDATE projects SET selected_idea_id = ? WHERE id = ?", [chosenIdeaId ?? ideasNow[0]?.id ?? null, project.id]).run();
  markCandidateSelected(env, chosenCandidate.id);
  if (chosenHookId != null) markHookSelected(env, chosenHookId);
  logContentEvent("TOPIC_SELECTED", {
    userId: project.user_id,
    projectId: project.id,
    topicCandidateId: chosenCandidate.id,
    data: { auto: true, via: chosen ? "juge" : "repli", justification: chosen?.justification ?? null },
  });

  // Le texte retourne doit etre celui du hook CHOISI (pas le meilleur au score).
  const chosenHookText =
    chosenHookId != null
      ? (bundles.get(chosenCandidate.id)?.hooks.find((h) => h.id === chosenHookId)?.hook_text ?? null)
      : null;
  return { hookId: chosenHookId, hookText: chosenHookText };
}

/**
 * Script par le juge + fact-check avec correction (phase 11). Si le juge est
 * indisponible (quota/saturation), repli sur `fallbackProvider` (le
 * generateur) avec le meme prompt : le script est produit quoi qu'il arrive,
 * en mode degrade signale. Si le fact-check bloque apres le nombre maximal de
 * corrections : erreur explicite.
 */
export async function generateScriptWithFactCheck(
  env: ServerEnv,
  project: ProjectRowLite,
  videoType: ReturnType<typeof getVideoType>,
  ideaText: string,
  hookText: string | null,
  language: string,
  judge: LlmProvider,
  fallbackProvider?: LlmProvider,
): Promise<{ script: ScriptResultParsed }> {
  const ceConfig = loadContentEngineConfig();

  const generate = async (provider: LlmProvider, feedback?: string) =>
    parseLlmJson(
      scriptResultSchema,
      await provider.complete(videoType.messagesScript({ idea: ideaText, language, hook: hookText ?? undefined, feedback })),
      "script",
    );

  let script: ScriptResultParsed;
  try {
    script = await generate(judge);
  } catch (e) {
    if (!fallbackProvider) throw e;
    console.warn("[content] juge indisponible, script genere par le generateur (mode degrade):", e);
    script = await generate(fallbackProvider);
  }
  if (!ceConfig.factCheck.enabled) return { script };

  for (let round = 0; round <= ceConfig.factCheck.maxCorrections; round++) {
    let report;
    try {
      report = await factCheckScript(judge, script.texte_continu, script.hook, language);
    } catch (e) {
      if (fallbackProvider) {
        try {
          report = await factCheckScript(fallbackProvider, script.texte_continu, script.hook, language);
        } catch (e2) {
          console.error("[content] fact check indisponible (juge et generateur), script accepte sans verification:", e2);
          return { script };
        }
      } else {
        console.error("[content] fact check indisponible, script accepte sans verification:", e);
        return { script };
      }
    }
    if (!report.blocking) return { script };
    if (round >= ceConfig.factCheck.maxCorrections) {
      logContentEvent("FACT_CHECK_FAILED", {
        userId: project.user_id,
        projectId: project.id,
        data: { reasons: report.blockingReasons },
      });
      throw new Error(`Fact check bloque : ${report.blockingReasons.join(" ; ")}`);
    }
    console.warn("[content] fact check : correction demandee :", report.blockingReasons.join(" ; "));
    try {
      script = await generate(judge, report.blockingReasons.join("\n"));
    } catch (e) {
      if (!fallbackProvider) throw e;
      console.warn("[content] juge indisponible pour la correction, generateur (mode degrade):", e);
      script = await generate(fallbackProvider, report.blockingReasons.join("\n"));
    }
  }
  return { script };
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
/** Fonction de rendu injectable (testabilité ; défaut = startVideoRender). */
export type RenderFn = (env: ServerEnv, project: ProjectRowLite, jobs: Jobs) => Promise<number>;

/** Convertit un nombre en prosodie Edge TTS : 8 -> "+8%", -2 -> "-2Hz". */
export function toRate(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n)}%`;
}
export function toPitch(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n)}Hz`;
}

// ------------------------------------------------------------
// Cohérence des dépendances (idée -> script -> voix)
// ------------------------------------------------------------

/**
 * Décide s'il faut regénérer le script ou la voix d'un projet auto.
 * Les dates viennent de SQLite (format "YYYY-MM-DD HH:MM:SS", comparables
 * lexicographiquement). Règles :
 *  - script : absent, ou idée sélectionnée plus récente que le script (le
 *    thème/l'idée a changé depuis la génération) ;
 *  - voix : absente, script regénéré, script plus récent que la voix, ou voix
 *    liée à un autre script que le script sélectionné.
 */
export interface RegenerationInput {
  mode: string;
  selectedIdeaAt: string | null;
  selectedScriptAt: string | null;
  selectedVoiceAt: string | null;
  voiceScriptId: number | null;
  selectedScriptId: number | null;
  hasScripts: boolean;
  hasVoices: boolean;
}

export function decideRegeneration(i: RegenerationInput): { regenScript: boolean; regenVoice: boolean } {
  if (i.mode !== "auto") return { regenScript: false, regenVoice: false };
  const ideaAfterScript = i.selectedIdeaAt != null && i.selectedScriptAt != null && i.selectedIdeaAt > i.selectedScriptAt;
  const regenScript = !i.hasScripts || ideaAfterScript;
  const scriptAfterVoice = i.selectedScriptAt != null && i.selectedVoiceAt != null && i.selectedScriptAt > i.selectedVoiceAt;
  const voiceMismatch = i.selectedScriptId != null && i.voiceScriptId != null && i.voiceScriptId !== i.selectedScriptId;
  const regenVoice = !i.hasVoices || regenScript || scriptAfterVoice || voiceMismatch;
  return { regenScript, regenVoice };
}

function gatherRegenInputs(env: ServerEnv, project: ProjectRowLite): RegenerationInput {
  const idea = project.selected_idea_id
    ? (dbQuery(env, "SELECT created_at FROM ideas WHERE id = ? AND project_id = ?", [project.selected_idea_id, project.id]).get() as { created_at: string } | undefined)
    : undefined;
  const script = project.selected_script_id
    ? (dbQuery(env, "SELECT created_at FROM scripts WHERE id = ? AND project_id = ?", [project.selected_script_id, project.id]).get() as { created_at: string } | undefined)
    : undefined;
  const voice = project.selected_voice_id
    ? (dbQuery(env, "SELECT script_id, created_at FROM voices WHERE id = ? AND project_id = ?", [project.selected_voice_id, project.id]).get() as { script_id: number | null; created_at: string } | undefined)
    : undefined;
  return {
    mode: project.mode,
    selectedIdeaAt: idea?.created_at ?? null,
    selectedScriptAt: script?.created_at ?? null,
    selectedVoiceAt: voice?.created_at ?? null,
    voiceScriptId: voice?.script_id != null ? Number(voice.script_id) : null,
    selectedScriptId: project.selected_script_id,
    hasScripts: (dbQuery(env, "SELECT COUNT(*) AS n FROM scripts WHERE project_id = ?", [project.id]).get() as { n: number }).n > 0,
    hasVoices: (dbQuery(env, "SELECT COUNT(*) AS n FROM voices WHERE project_id = ?", [project.id]).get() as { n: number }).n > 0,
  };
}

/** Supprime les voix du projet (fichiers + lignes) et déselectionne la voix. */
function deleteProjectVoices(env: ServerEnv, projectId: number, outputDir: string): void {
  const dir = path.resolve(outputDir, "projects", String(projectId));
  const voices = dbQuery(env, "SELECT file_name, subs_file, wb_file FROM voices WHERE project_id = ?", [projectId]).all() as {
    file_name: string;
    subs_file: string | null;
    wb_file: string | null;
  }[];
  for (const v of voices) {
    for (const f of [v.file_name, v.subs_file, v.wb_file]) {
      if (f) {
        try { fs.rmSync(path.join(dir, f), { force: true }); } catch { /* fichier absent */ }
      }
    }
  }
  dbQuery(env, "DELETE FROM voices WHERE project_id = ?", [projectId]).run();
  dbQuery(env, "UPDATE projects SET selected_voice_id = NULL WHERE id = ?", [projectId]).run();
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
    // Requetes d'images : le generateur (DeepSeek) suffit, pas besoin du juge.
    const llm = createContentLlms(config).generator;
    const dir = path.resolve(config.outputDir, "projects", String(project.id));
    const audioAbs = path.join(dir, String(voiceRow.file_name));

    // Mascotte (PNG) du compte utilisateur : incrustee en bas si presente, sinon rien.
    // Chemin ABSOLU : ffmpeg tourne avec cwd=dossier projet, un chemin relatif serait introuvable.
    let mascot: string | null = null;
    const userMascot = path.resolve(env.userMascotsDir, String(project.user_id), "mascot.png");
    if (fsExistsSync(userMascot)) mascot = userMascot;

    const scriptRow = voiceRow.script_id
      ? dbQuery(env, "SELECT script_json, hook_id FROM scripts WHERE id = ? AND project_id = ?", [Number(voiceRow.script_id), project.id]).get() as { script_json: string; hook_id: number | null } | undefined
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
    const candidate = selectedCandidateForProject(env, project.id);
    const info = dbQuery(
      env,
      "INSERT INTO videos (project_id, file_name, duration, title, description, tags, topic_candidate_id, hook_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [project.id, outName, duration, titreYoutube, description, JSON.stringify(hashtags), candidate?.id ?? null, scriptRow?.hook_id ?? null],
    ).run();
    const videoId = Number(info.lastInsertRowid);
    linkVideoCategories(env, videoId, candidate?.id ?? null);
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
    logContentEvent("VIDEO_GENERATED", {
      userId: project.user_id,
      projectId: project.id,
      videoId: Number(info.lastInsertRowid),
      topicCandidateId: candidate?.id ?? undefined,
      hookId: scriptRow?.hook_id ?? undefined,
    });
    jobs.set(key, { step: "done", progress: 1, running: false });
    return Number(info.lastInsertRowid);
  } catch (e) {
    console.error("[video] render error:", e);
    jobs.set(key, { step: "error", progress: 0, running: false, error: "Error while rendering the video" });
    throw e;
  }
}

async function runFullCreation(env: ServerEnv, project: ProjectRowLite, jobs: Jobs = new Map(), requestedVoice?: string, voiceRate?: string, voicePitch?: string, languageOverride?: string): Promise<number> {
  const key = project.id;
  const setJob = (step: string, progress: number) => jobs.set(key, { step, progress, running: true });
  setJob("preparation", 0.02);
  try {
    const config = loadConfig();
    const { generator, judge } = createContentLlms(config);
    const ceConfig = loadContentEngineConfig();
    // Langue effective : regle d'automatisation > langue du compte > config globale.
    const lang = (languageOverride ?? "").trim() || resolveLanguage(env, project.user_id, config.language);

    // 1) IDEES (si auto et aucune) : generator (DeepSeek)
    if (project.mode === "auto" && getIdeas(env, project.id).length === 0) {
      setJob("ideas", 0.08);
      const usedTopics = getUsedTopics(env, project.user_id);
      const raw = await generator.complete(getVideoType(project.video_type).messagesIdees({ topic: project.topic, nIdeas: config.nIdeas, language: lang, usedTopics }));
      const { idees } = parseLlmJson(ideasResultSchema, raw, "idees");
      dbQuery(env, "DELETE FROM ideas WHERE project_id = ?", [project.id]).run();
      const ins = dbQuery(env, "INSERT INTO ideas (project_id, position, idea_text, titre, hook, angle, fond) VALUES (?, ?, ?, ?, ?, ?, ?)");
      idees.forEach((id, i) => ins.run(project.id, i + 1, id.sujet, id.titre ?? null, id.hook ?? null, id.angle ?? null, id.fond ?? null));
      recordTopics(env, project.user_id, idees.map((id) => id.sujet));
      archiveProjectCandidates(env, project.id, "superseded: regeneration d'idees");
      await persistScoredCandidates(env, project, idees, judge, lang);
    }

    // 2) selection (si auto) : hooks top K + juge = couple gagnant
    let proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    const ideasNow = getIdeas(env, project.id);
    let selectedHook: { hookId: number | null; hookText: string | null } = { hookId: null, hookText: null };
    if (proj.mode === "auto" && ideasNow.length > 0 && !proj.selected_idea_id) {
      selectedHook = await runAutoContentSelection(env, project, generator, judge, lang, ceConfig);
      proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    }

    // 3) SCRIPT (juge) + fact-check (regénéré si l'idée sélectionnée est plus récente)
    const regen3 = decideRegeneration(gatherRegenInputs(env, proj));
    if (regen3.regenScript) {
      deleteProjectVoices(env, project.id, config.outputDir);
      dbQuery(env, "DELETE FROM scripts WHERE project_id = ?", [project.id]).run();
      setJob("script", 0.25);
      const ideaText = proj.selected_idea_id
        ? ((dbQuery(env, "SELECT idea_text FROM ideas WHERE id = ? AND project_id = ?", [proj.selected_idea_id, project.id]).get() as { idea_text: string } | undefined)?.idea_text ?? proj.topic)
        : proj.topic;
      // Hors selection auto (manuel ou repli) : hooks pour le candidat choisi.
      let hookId = selectedHook.hookId;
      let hookText = selectedHook.hookText;
      if (hookId == null && proj.selected_idea_id) {
        const candidate = candidateForIdea(env, project.id, proj.selected_idea_id);
        if (candidate) {
          const bundle = await ensureHooksForCandidate(env, candidate, generator, judge, lang, ceConfig.hookScoring);
          if (bundle.bestHookId != null) {
            markHookSelected(env, bundle.bestHookId);
            hookId = bundle.bestHookId;
            hookText = bestHookText(env, candidate.id);
          }
        }
      }
      const { script } = await generateScriptWithFactCheck(env, project, getVideoType(project.video_type), ideaText, hookText, lang, judge, generator);
      const info = dbQuery(env, "INSERT INTO scripts (project_id, script_json, hook_id) VALUES (?, ?, ?)", [project.id, JSON.stringify(script), hookId ?? null]).run();
      dbQuery(env, "UPDATE projects SET status = 'script', selected_script_id = ? WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
      logContentEvent("SCRIPT_GENERATED", {
        userId: project.user_id,
        projectId: project.id,
        hookId: hookId ?? undefined,
        data: { scriptId: Number(info.lastInsertRowid) },
      });
      proj = getProjectRow(env, project.id, project.user_id) as unknown as ProjectRowLite;
    }

    // 4) VOIX (regénérée si le script sélectionné est plus récent, ou si la voix
    // est liée à un autre script)
    const regen4 = decideRegeneration(gatherRegenInputs(env, proj));
    if (regen4.regenVoice) {
      deleteProjectVoices(env, project.id, config.outputDir);
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

export function workflowRouter(env: ServerEnv, opts: { renderFn?: RenderFn } = {}): Router {
  const router = Router();
  const renderFn = opts.renderFn ?? startVideoRender;

  // --- 1) Generer les IDEES ---
  router.post("/projects/:id/ideas", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");

    const config = loadConfig();
    const { generator, judge } = createContentLlms(config);
    const lang = resolveLanguage(env, req.auth!.userId, config.language);
    const usedTopics = getUsedTopics(env, req.auth!.userId);
    const raw = await generator.complete(
      getVideoType(project.video_type).messagesIdees({ topic: project.topic, nIdeas: config.nIdeas, language: lang, usedTopics }),
    );
    const { idees } = parseLlmJson(ideasResultSchema, raw, "idees");

    // Vide les anciennes idees (regeneration) puis insere.
    dbQuery(env, "DELETE FROM ideas WHERE project_id = ?", [project.id]).run();
    const insert = dbQuery(env, "INSERT INTO ideas (project_id, position, idea_text, titre, hook, angle, fond) VALUES (?, ?, ?, ?, ?, ?, ?)");
    idees.forEach((id, i) => {
      insert.run(project.id, i + 1, id.sujet, id.titre ?? null, id.hook ?? null, id.angle ?? null, id.fond ?? null);
    });
    recordTopics(env, req.auth!.userId, idees.map((id) => id.sujet));
    archiveProjectCandidates(env, project.id, "superseded: regeneration d'idees");
    await persistScoredCandidates(env, project as unknown as ProjectRowLite, idees, judge, lang);
    dbQuery(env, "UPDATE projects SET status = 'ideas' WHERE id = ?", [project.id]).run();
    touchUpdated(env, project.id);

    // Tri par score (Gemini) : les meilleures idees en premier, scores visibles.
    const scores = candidateScoreMap(env, project.id);
    const ranked = getIdeas(env, project.id)
      .map((idea) => {
        const s = scores.get(idea.ideaText);
        return { ...idea, totalScore: s?.total ?? null, scoreStatus: s?.status ?? null };
      })
      .sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1));

    res.json({ ideas: ranked, status: "ideas" });
  }));

  // --- 2) Selectionner une idee ---
  router.post("/projects/:id/select-idea", asyncHandler(async (req, res) => {
    const project = getProjectRow(env, Number(req.params.id), req.auth!.userId);
    if (!project) throw new ApiError(404, "Project not found");
    const parsed = selectIdeaSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");

    const idea = dbQuery(env, "SELECT id FROM ideas WHERE id = ? AND project_id = ?", [parsed.data.ideaId, project.id]).get();
    if (!idea) throw new ApiError(404, "Idea not found");

    dbQuery(env, "UPDATE projects SET selected_idea_id = ?, selected_script_id = NULL, selected_voice_id = NULL, status = 'ideas' WHERE id = ?", [parsed.data.ideaId, project.id]).run();
    const candidate = candidateForIdea(env, project.id, parsed.data.ideaId);
    if (candidate) {
      markCandidateSelected(env, candidate.id);
      logContentEvent("TOPIC_SELECTED", {
        userId: req.auth!.userId,
        projectId: project.id,
        topicCandidateId: candidate.id,
        data: { auto: false },
      });
    }
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
    const { generator, judge } = createContentLlms(config);
    const ceConfig = loadContentEngineConfig();
    const lang = resolveLanguage(env, req.auth!.userId, config.language);
    // Hooks pour le candidat choisi manuellement, puis script par le juge + fact-check.
    let hookId: number | null = null;
    let hookText: string | null = null;
    const candidate = project.selected_idea_id ? candidateForIdea(env, project.id, project.selected_idea_id) : null;
    if (candidate) {
      const bundle = await ensureHooksForCandidate(env, candidate, generator, judge, lang, ceConfig.hookScoring);
      if (bundle.bestHookId != null) {
        markHookSelected(env, bundle.bestHookId);
        hookId = bundle.bestHookId;
        hookText = bestHookText(env, candidate.id);
      }
    }
    const { script } = await generateScriptWithFactCheck(env, project as unknown as ProjectRowLite, getVideoType(project.video_type), ideaText, hookText, lang, judge, generator);

    dbQuery(env, "DELETE FROM scripts WHERE project_id = ?", [project.id]).run();
    const info = dbQuery(env, "INSERT INTO scripts (project_id, script_json, hook_id) VALUES (?, ?, ?)", [project.id, JSON.stringify(script), hookId ?? null]).run();
    dbQuery(env, "UPDATE projects SET status = 'script', selected_script_id = ?, selected_voice_id = NULL WHERE id = ?", [Number(info.lastInsertRowid), project.id]).run();
    logContentEvent("SCRIPT_GENERATED", {
      userId: req.auth!.userId,
      projectId: project.id,
      hookId: hookId ?? undefined,
      data: { scriptId: Number(info.lastInsertRowid) },
    });
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
    const running = renderJobs.get(project.id);
    if (running?.running) throw new ApiError(409, "A render is already running for this project");
    renderFn(env, project, renderJobs).catch(() => undefined);
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
    const running = renderJobs.get(project.id);
    if (running?.running) throw new ApiError(409, "A render is already running for this project");
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

  // --- Configuration effective du moteur (poids, seuils, exploration) ---
  router.get("/content-engine/config", asyncHandler(async (_req, res) => {
    res.json({ config: loadContentEngineConfig() });
  }));

  // --- Recommandation du prochain contenu (learning, lot 7) ---
  router.get("/content-engine/recommendation", asyncHandler(async (req, res) => {
    const report = computeAndPersistRecommendation(env, req.auth!.userId);
    res.json(report);
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
  opts?: { voiceName?: string; rate?: string; pitch?: string; language?: string },
): Promise<number> {
  const project = getProjectById(env, projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  return runFullCreation(env, project, new Map(), opts?.voiceName, opts?.rate, opts?.pitch, opts?.language);
}
