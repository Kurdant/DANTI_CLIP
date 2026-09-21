import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb, closeDb } from "../server/src/db/db.ts";
import type { ServerEnv } from "../server/src/lib/env.ts";
import type { LlmProvider } from "../src/llm/types.ts";
import { saveIdeasAsCandidates, markCandidateSelected, saveHooks, type CandidateRow } from "../server/src/lib/contentEngine.ts";
import { runAutoContentSelection, generateScriptWithFactCheck } from "../server/src/routes/workflow.ts";
import { DEFAULT_CONTENT_ENGINE_CONFIG } from "../src/content-engine/config.ts";
import { getVideoType } from "../src/videoTypes.ts";
import { setContentLogSink, resetContentLogSink } from "../src/content-engine/logging.ts";

function testEnv(dbPath: string): ServerEnv {
  return {
    port: 0, dataDir: path.dirname(dbPath), dbPath,
    outputDir: "", backgroundsDir: "", userBackgroundsDir: "", userMascotsDir: "",
    userBgQuotaBytes: 0, cookieSecure: false, trustProxy: 0,
    adminUsername: "a", adminPassword: "a", sessionDays: 30,
    youtubeClientId: "", youtubeClientSecret: "", youtubeRedirectUri: "",
    youtubeApiKey: "", secretKey: "", pexelsApiKey: "", musicDir: "", sfxDir: "",
  };
}

function newDb(): { env: ServerEnv; db: ReturnType<typeof getDb> } {
  closeDb();
  const dir = mkdtempSync(path.join(tmpdir(), "danti-multi-"));
  const env = testEnv(path.join(dir, "t.db"));
  const db = getDb(env);
  const user = db.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run();
  const userId = Number(user.lastInsertRowid);
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (?, 'p', '', 'auto')").run(userId);
  return { env, db: db as ReturnType<typeof getDb> };
}

/** Fournisseur a reponses scriptees (une par appel, dans l'ordre). */
function scripted(jsons: unknown[], fallback?: unknown): LlmProvider {
  let i = 0;
  return {
    name: "scripted",
    complete: async () => {
      const next = jsons[Math.min(i, jsons.length - 1)] ?? fallback;
      i++;
      return JSON.stringify(next);
    },
  };
}

const STRONG = {
  scores: {
    demand: 0.9, curiosity: 0.9, emotionalImpact: 0.8, novelty: 0.9,
    visualPotential: 0.8, commentPotential: 0.8, sharePotential: 0.8,
    searchPotential: 0.7, audienceRelevance: 0.9, credibility: 0.9,
    saturation: 0.1, banality: 0.1, followUpPotential: 0.8,
  },
  penalties: { tooKnown: 0, lowVisual: 0, tooGeneric: 0, hardToProve: 0, lowCredibility: 0 },
  justification: "fort",
};

const HOOK_SCORES = { curiosity: 0.9, clarity: 0.9, specificity: 0.8, surprise: 0.8, emotionalImpact: 0.7, openLoop: 0.8, credibility: 0.9, scrollStoppingPotential: 0.8 };

afterEach(() => resetContentLogSink());

test("selection auto : le juge choisit le candidat 2, son hook est retenu", async () => {
  const { env, db } = newDb();
  const projectId = (db.prepare("SELECT id FROM projects").get() as { id: number }).id;
  const userId = (db.prepare("SELECT id FROM users").get() as { id: number }).id;

  const ids = saveIdeasAsCandidates(env, userId, projectId, [
    { sujet: "Candidat A", titre: "A" },
    { sujet: "Candidat B", titre: "B" },
  ], [STRONG, STRONG]);
  // Idees liees par texte.
  db.prepare("INSERT INTO ideas (project_id, position, idea_text) VALUES (?, 1, 'Candidat A')").run(projectId);
  db.prepare("INSERT INTO ideas (project_id, position, idea_text) VALUES (?, 2, 'Candidat B')").run(projectId);

  const generator = scripted([
    { hooks: [{ hook_text: "Hook A", pattern: "curiosity_gap" }, { hook_text: "Hook A2", pattern: "question" }, { hook_text: "Hook A3", pattern: "mystery" }] },
    { hooks: [{ hook_text: "Hook B", pattern: "experience" }, { hook_text: "Hook B2", pattern: "question" }, { hook_text: "Hook B3", pattern: "mystery" }] },
  ]);
  const judge = scripted([
    // evaluation des hooks A
    { evaluations: [{ scores: HOOK_SCORES, justification: "a" }, { scores: HOOK_SCORES, justification: "a" }, { scores: HOOK_SCORES, justification: "a" }] },
    // evaluation des hooks B
    { evaluations: [{ scores: HOOK_SCORES, justification: "b" }, { scores: HOOK_SCORES, justification: "b" }, { scores: HOOK_SCORES, justification: "b" }] },
    // selection finale : candidat 2, hook 2
    { candidate_index: 2, hook_index: 2, justification: "B2 plus fort" },
  ]);

  const result = await runAutoContentSelection(
    env,
    { id: projectId, user_id: userId, title: "p", topic: "", mode: "auto", status: "ideas", selected_idea_id: null, selected_script_id: null, selected_voice_id: null, selected_background: null, text_style: "classic", video_type: "culture-generale" } as never,
    generator,
    judge,
    "fr",
    DEFAULT_CONTENT_ENGINE_CONFIG,
  );

  assert.equal(result.hookText, "Hook B2");
  const proj = db.prepare("SELECT selected_idea_id FROM projects WHERE id = ?").get(projectId) as { selected_idea_id: number };
  const idea = db.prepare("SELECT idea_text FROM ideas WHERE id = ?").get(proj.selected_idea_id) as { idea_text: string };
  assert.equal(idea.idea_text, "Candidat B", "l'idee du candidat choisi par le juge doit etre selectionnee");

  const candB = db.prepare("SELECT status FROM topic_candidates WHERE title = 'B'").get() as { status: string };
  assert.equal(candB.status, "selected");
  const hookRow = db.prepare("SELECT status FROM hooks WHERE hook_text = 'Hook B2'").get() as { status: string };
  assert.equal(hookRow.status, "selected");
  // ids[0] => A
  assert.ok(ids.length === 2);
});

test("selection auto : juge en echec -> repli deterministe sur le meilleur score", async () => {
  const { env, db } = newDb();
  const projectId = (db.prepare("SELECT id FROM projects").get() as { id: number }).id;
  const userId = (db.prepare("SELECT id FROM users").get() as { id: number }).id;

  saveIdeasAsCandidates(env, userId, projectId, [
    { sujet: "Candidat A fort", titre: "A" },
    { sujet: "Candidat B moyen", titre: "B" },
  ], [STRONG, { ...STRONG, scores: { ...STRONG.scores, demand: 0.4, curiosity: 0.4 } }]);
  db.prepare("INSERT INTO ideas (project_id, position, idea_text) VALUES (?, 1, 'Candidat A fort')").run(projectId);
  db.prepare("INSERT INTO ideas (project_id, position, idea_text) VALUES (?, 2, 'Candidat B moyen')").run(projectId);

  const generator = scripted([{ hooks: [] }]); // generation en echec (min 3 exige) -> pas de hooks
  const judge = scripted([], { reponse: "OK" }); // reponses invalides partout

  const result = await runAutoContentSelection(
    env,
    { id: projectId, user_id: userId, title: "p", topic: "", mode: "auto", status: "ideas", selected_idea_id: null, selected_script_id: null, selected_voice_id: null, selected_background: null, text_style: "classic", video_type: "culture-generale" } as never,
    generator,
    judge,
    "fr",
    DEFAULT_CONTENT_ENGINE_CONFIG,
  );

  assert.equal(result.hookText, null, "sans hooks, pas de hook fixe");
  const proj = db.prepare("SELECT selected_idea_id FROM projects WHERE id = ?").get(projectId) as { selected_idea_id: number };
  const idea = db.prepare("SELECT idea_text FROM ideas WHERE id = ?").get(proj.selected_idea_id) as { idea_text: string };
  assert.equal(idea.idea_text, "Candidat A fort", "le meilleur score gagne en repli");
});

test("script + fact-check : correction puis acceptation", async () => {
  const { env, db } = newDb();
  const projectId = (db.prepare("SELECT id FROM projects").get() as { id: number }).id;
  const userId = (db.prepare("SELECT id FROM users").get() as { id: number }).id;

  const scriptV1 = {
    titre: "T", titre_youtube: "T", hook: "H",
    duree: "18s", texte_continu: "H. Faux 10% du cerveau.", fond: "", description: "", hashtags: [],
    structure: [{ partie: "hook", texte: "H", duree: "2s" }, { partie: "chute", texte: "fin", duree: "3s" }],
  };
  const scriptV2 = { ...scriptV1, texte_continu: "H. Vraie information corrigee." };

  const judge = scripted([
    scriptV1,
    { checks: [{ claim: "On n'utilise que 10% de notre cerveau", verdict: "conteste", reason: "mythe" }] },
    scriptV2,
    { checks: [{ claim: "Vraie information corrigee", verdict: "fact", reason: "ok" }] },
  ]);

  const { script } = await generateScriptWithFactCheck(
    env,
    { id: projectId, user_id: userId, title: "p", topic: "", mode: "auto", status: "ideas", selected_idea_id: null, selected_script_id: null, selected_voice_id: null, selected_background: null, text_style: "classic", video_type: "culture-generale" } as never,
    getVideoType("culture-generale"),
    "Candidat",
    null,
    "fr",
    judge,
  );

  assert.equal(script.texte_continu, "H. Vraie information corrigee.");
});

test("script + fact-check : blocage persistant -> erreur explicite + FACT_CHECK_FAILED", async () => {
  const { env, db } = newDb();
  const projectId = (db.prepare("SELECT id FROM projects").get() as { id: number }).id;
  const userId = (db.prepare("SELECT id FROM users").get() as { id: number }).id;

  const scriptV1 = {
    titre: "T", titre_youtube: "T", hook: "H",
    duree: "18s", texte_continu: "H. Mythe persistant.", fond: "", description: "", hashtags: [],
    structure: [{ partie: "hook", texte: "H", duree: "2s" }, { partie: "chute", texte: "fin", duree: "3s" }],
  };
  const judge = scripted([
    scriptV1,
    { checks: [{ claim: "Mythe persistant", verdict: "conteste", reason: "faux" }] },
    scriptV1,
    { checks: [{ claim: "Mythe persistant", verdict: "conteste", reason: "faux" }] },
  ]);

  const lines: string[] = [];
  setContentLogSink((l) => lines.push(l));

  await assert.rejects(
    () => generateScriptWithFactCheck(
      env,
      { id: projectId, user_id: userId, title: "p", topic: "", mode: "auto", status: "ideas", selected_idea_id: null, selected_script_id: null, selected_voice_id: null, selected_background: null, text_style: "classic", video_type: "culture-generale" } as never,
      getVideoType("culture-generale"),
      "Candidat",
      null,
      "fr",
      judge,
    ),
    /Fact check bloque/,
  );
  const events = lines.map((l) => JSON.parse(l).event);
  assert.ok(events.includes("FACT_CHECK_FAILED"));
});

test("script + fact-check : juge indisponible -> repli generateur (mode degrade)", async () => {
  const { env, db } = newDb();
  const projectId = (db.prepare("SELECT id FROM projects").get() as { id: number }).id;
  const userId = (db.prepare("SELECT id FROM users").get() as { id: number }).id;

  const scriptV1 = {
    titre: "T", titre_youtube: "T", hook: "H",
    duree: "18s", texte_continu: "H. Contenu degrade mais valide.", fond: "", description: "", hashtags: [],
    structure: [{ partie: "hook", texte: "H", duree: "2s" }, { partie: "chute", texte: "fin", duree: "3s" }],
  };

  const judge: LlmProvider = { name: "juge-down", complete: async () => { throw new Error("LLM gemini error 503"); } };
  const generator = scripted([scriptV1, { checks: [{ claim: "Contenu degrade mais valide", verdict: "fact", reason: "ok" }] }]);

  const { script } = await generateScriptWithFactCheck(
    env,
    { id: projectId, user_id: userId, title: "p", topic: "", mode: "auto", status: "ideas", selected_idea_id: null, selected_script_id: null, selected_voice_id: null, selected_background: null, text_style: "classic", video_type: "culture-generale" } as never,
    getVideoType("culture-generale"),
    "Candidat",
    null,
    "fr",
    judge,
    generator,
  );

  assert.equal(script.texte_continu, "H. Contenu degrade mais valide.");
});
