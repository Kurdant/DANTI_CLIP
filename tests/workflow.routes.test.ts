import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import type { Server } from "node:http";
import { getDb, closeDb } from "../server/src/db/db.ts";
import type { ServerEnv } from "../server/src/lib/env.ts";
import { workflowRouter, type RenderFn, resolveLanguage } from "../server/src/routes/workflow.ts";

function testEnv(dbPath: string): ServerEnv {
  return {
    port: 0,
    dataDir: path.dirname(dbPath),
    dbPath,
    outputDir: path.join(path.dirname(dbPath), "output"),
    backgroundsDir: "",
    userBackgroundsDir: "",
    userMascotsDir: "",
    userBgQuotaBytes: 1024 * 1024 * 1024,
    cookieSecure: false,
    trustProxy: 0,
    adminUsername: "admin",
    adminPassword: "admin",
    sessionDays: 30,
    youtubeClientId: "",
    youtubeClientSecret: "",
    youtubeRedirectUri: "",
    youtubeApiKey: "",
    secretKey: "",
    pexelsApiKey: "",
    musicDir: "",
    sfxDir: "",
  };
}

interface Harness {
  env: ServerEnv;
  baseUrl: string;
  server: Server;
  userId: number;
  projectId: number;
}

async function startHarness(renderFn?: RenderFn): Promise<Harness> {
  closeDb();
  const dir = mkdtempSync(path.join(tmpdir(), "danti-workflow-"));
  const env = testEnv(path.join(dir, "test.db"));
  const db = getDb(env);

  const user = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run("tester", "x");
  const userId = Number(user.lastInsertRowid);
  const project = db
    .prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (?, ?, ?, ?)")
    .run(userId, "Test project", "test topic", "auto");
  const projectId = Number(project.lastInsertRowid);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.env = env;
    req.auth = { userId, csrfToken: "t" };
    next();
  });
  app.use("/api", workflowRouter(env, renderFn ? { renderFn } : {}));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { env, baseUrl: `http://127.0.0.1:${address.port}/api`, server, userId, projectId };
}

test("render sans voix : le job passe en erreur (pas de rejet non gere)", async () => {
  const h = await startHarness();
  try {
    const start = await fetch(`${h.baseUrl}/projects/${h.projectId}/video`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    assert.equal(start.status, 202);

    let status: { step: string; running: boolean; error?: string } | null = null;
    for (let i = 0; i < 30 && status?.running !== false; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const res = await fetch(`${h.baseUrl}/projects/${h.projectId}/video/status`);
      status = (await res.json()) as { step: string; running: boolean; error?: string };
    }
    assert.ok(status, "statut du job absent");
    assert.equal(status!.running, false);
    assert.equal(status!.step, "error");
  } finally {
    h.server.close();
  }
});

test("deux rendus simultanes : le second est refuse (409)", async () => {
  let resolveRender!: () => void;
  const renderFn: RenderFn = (_env, project, jobs) => {
    jobs.set(project.id, { step: "rendering", progress: 0, running: true });
    return new Promise<number>((resolve) => {
      resolveRender = () => {
        jobs.set(project.id, { step: "done", progress: 1, running: false });
        resolve(1);
      };
    });
  };
  const h = await startHarness(renderFn);
  try {
    const first = await fetch(`${h.baseUrl}/projects/${h.projectId}/video`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    assert.equal(first.status, 202);
    const second = await fetch(`${h.baseUrl}/projects/${h.projectId}/video`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    assert.equal(second.status, 409);
    resolveRender!();
    await new Promise((r) => setTimeout(r, 50));
    const status = await (await fetch(`${h.baseUrl}/projects/${h.projectId}/video/status`)).json() as { step: string; running: boolean };
    assert.equal(status.running, false);
    assert.equal(status.step, "done");
  } finally {
    resolveRender?.();
    h.server.close();
  }
});

test("generation d'idees : les candidats sont persistes et scores", async () => {
  const previous = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "mock";
  const h = await startHarness();
  try {
    const res = await fetch(`${h.baseUrl}/projects/${h.projectId}/ideas`, {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ideas: unknown[]; status: string };
    assert.equal(body.status, "ideas");
    assert.ok(body.ideas.length > 0);

    const db = getDb(h.env);
    const candidates = db.prepare("SELECT * FROM topic_candidates WHERE project_id = ? ORDER BY id").all(h.projectId) as {
      total_score: number | null;
      score_version: number;
      score_detail: string | null;
      status: string;
    }[];
    assert.equal(candidates.length, body.ideas.length, "un candidat doit etre cree par idee");
    for (const c of candidates) {
      assert.ok(c.total_score != null, "score total manquant");
      assert.equal(c.score_version, 1);
      assert.ok(c.score_detail && JSON.parse(c.score_detail), "decomposition du score absente");
    }
  } finally {
    h.server.close();
    if (previous === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previous;
  }
});

test("parcours mock complet : idees -> selection -> script (repli sans hook)", async () => {
  const previous = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "mock";
  const h = await startHarness();
  try {
    const ideasRes = await fetch(`${h.baseUrl}/projects/${h.projectId}/ideas`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    assert.equal(ideasRes.status, 200);
    const { ideas } = (await ideasRes.json()) as { ideas: { id: number }[] };
    assert.ok(ideas.length > 0);

    const selectRes = await fetch(`${h.baseUrl}/projects/${h.projectId}/select-idea`, {
      method: "POST",
      body: JSON.stringify({ ideaId: ideas[0].id }),
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(selectRes.status, 200);

    const scriptRes = await fetch(`${h.baseUrl}/projects/${h.projectId}/script`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    assert.equal(scriptRes.status, 200);

    const db = getDb(h.env);
    const scriptRow = db.prepare("SELECT script_json, hook_id FROM scripts WHERE project_id = ? ORDER BY id DESC LIMIT 1").get(h.projectId) as { script_json: string; hook_id: number | null };
    assert.ok(scriptRow, "script absent");
    const parsed = JSON.parse(scriptRow.script_json);
    assert.ok(parsed.texte_continu && Array.isArray(parsed.structure), "script invalide");
    // Le mock ne sait pas generer de hooks : repli sans hook fixe, mais script valide.
    assert.equal(scriptRow.hook_id, null);
    const candidates = db.prepare("SELECT status FROM topic_candidates WHERE project_id = ?").all(h.projectId) as { status: string }[];
    assert.ok(candidates.some((c) => c.status === "selected"), "aucun candidat marque selectionne");
  } finally {
    h.server.close();
    if (previous === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previous;
  }
});

test("configuration du moteur exposee par l'API", async () => {
  const h = await startHarness();
  try {
    const res = await fetch(`${h.baseUrl}/content-engine/config`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { config: { topicScoring: { version: number; weights: Record<string, number> }; hookScoring: { variantsPerTopic: number }; explorationRate: number } };
    assert.equal(body.config.topicScoring.version, 1);
    assert.ok(body.config.topicScoring.weights.curiosity > 0);
    assert.ok(body.config.hookScoring.variantsPerTopic > 0);
    assert.ok(body.config.explorationRate >= 0 && body.config.explorationRate <= 1);
  } finally {
    h.server.close();
  }
});

test("recommandation : sans donnees -> exploration explicable, decision persistee", async () => {
  const h = await startHarness();
  try {
    const res = await fetch(`${h.baseUrl}/content-engine/recommendation`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { recommendation: { mode: string; reasons: string[] }; totalObservations: number };
    assert.equal(body.recommendation.mode, "explore");
    assert.ok(body.recommendation.reasons.length > 0);
    assert.equal(body.totalObservations, 0);

    const db = getDb(h.env);
    const decisions = db.prepare("SELECT decision_json FROM content_decisions WHERE user_id = ?").all(h.userId) as { decision_json: string }[];
    assert.equal(decisions.length, 1, "la decision doit etre persistee");
    const parsed = JSON.parse(decisions[0].decision_json);
    assert.equal(parsed.recommendation.mode, "explore");
  } finally {
    h.server.close();
  }
});

test("recommandation : donnees suffisantes -> exploitation, categories et hooks lies", async () => {
  const h = await startHarness();
  try {
    // Tirage d'exploration desactive pour rendre le test deterministe.
    const cfgFile = path.join(mkdtempSync(path.join(tmpdir(), "danti-cfg-")), "cfg.json");
    writeFileSync(cfgFile, JSON.stringify({ explorationRate: 0 }), "utf8");
    const previousCfg = process.env.CONTENT_ENGINE_CONFIG;
    process.env.CONTENT_ENGINE_CONFIG = cfgFile;
    try {
      const db = getDb(h.env);
    const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (?, 'p', '', 'auto')").run(h.userId);
    const projectId = Number(project.lastInsertRowid);

    const seedGroup = (pattern: string, views: number, slug: string, count: number): void => {
      const cand = db.prepare("INSERT INTO topic_candidates (user_id, project_id, title, idea_text, status) VALUES (?, ?, ?, ?, 'used')").run(h.userId, projectId, `cand-${pattern}-${slug}`, `idea ${pattern} ${slug}`);
      const candidateId = Number(cand.lastInsertRowid);
      const cat = db.prepare("SELECT id FROM categories WHERE slug = ?").get(slug) as { id: number };
      db.prepare("INSERT INTO topic_categories (topic_candidate_id, category_id) VALUES (?, ?)").run(candidateId, cat.id);
      for (let i = 0; i < count; i++) {
        const hook = db.prepare("INSERT INTO hooks (topic_candidate_id, hook_text, pattern) VALUES (?, ?, ?)").run(candidateId, `hook ${pattern} ${i}`, pattern);
        const hookId = Number(hook.lastInsertRowid);
        const video = db.prepare("INSERT INTO videos (project_id, file_name, duration, hook_id) VALUES (?, ?, 24, ?)").run(projectId, `v-${pattern}-${i}.mp4`, hookId);
        const videoId = Number(video.lastInsertRowid);
        db.prepare("INSERT INTO video_categories (video_id, category_id) VALUES (?, ?)").run(videoId, cat.id);
        db.prepare("INSERT INTO video_stats (video_id, views, likes, comments, captured_at) VALUES (?, ?, ?, ?, datetime('now'))").run(videoId, views, 100, 20);
      }
    };
    seedGroup("experience", 2500, "psychology", 6);
    seedGroup("mystery", 400, "space", 2);

    const res = await fetch(`${h.baseUrl}/content-engine/recommendation`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { recommendation: { mode: string; hookPattern: string | null; category: string | null; basedOnSampleSize: number }; byCategory: { value: string; sampleSize: number }[] };
    assert.equal(body.recommendation.mode, "exploit");
    assert.equal(body.recommendation.hookPattern, "experience");
    assert.ok(body.recommendation.category === "psychology" || body.recommendation.category === null);
    assert.ok(body.recommendation.basedOnSampleSize >= 6);
    assert.ok(body.byCategory.some((c) => c.value === "psychology" && c.sampleSize === 6));
    } finally {
      if (previousCfg === undefined) delete process.env.CONTENT_ENGINE_CONFIG;
      else process.env.CONTENT_ENGINE_CONFIG = previousCfg;
    }
  } finally {
    h.server.close();
  }
});

test("langue du compte : priorite compte > config globale", async () => {
  const h = await startHarness();
  try {
    const db = getDb(h.env);
    assert.equal(resolveLanguage(h.env, h.userId, "en"), "en", "sans langue de compte : fallback global");
    db.prepare("UPDATE users SET language = 'fr' WHERE id = ?").run(h.userId);
    assert.equal(resolveLanguage(h.env, h.userId, "en"), "fr", "la langue du compte prime");
    db.prepare("UPDATE users SET language = '' WHERE id = ?").run(h.userId);
    assert.equal(resolveLanguage(h.env, h.userId, "en"), "en", "langue vide : fallback global");
  } finally {
    h.server.close();
  }
});

test("selection d'une idee : les selections script/voix sont reinitialisees", async () => {
  const h = await startHarness();
  try {
    const db = getDb(h.env);
    const idea = db.prepare("INSERT INTO ideas (project_id, position, idea_text) VALUES (?, 1, ?)").run(h.projectId, "fact nouveau");
    const ideaId = Number(idea.lastInsertRowid);
    const script = db.prepare("INSERT INTO scripts (project_id, script_json) VALUES (?, ?)").run(h.projectId, "{}");
    const scriptId = Number(script.lastInsertRowid);
    const voice = db.prepare("INSERT INTO voices (project_id, script_id, voice_name, file_name) VALUES (?, ?, ?, ?)").run(h.projectId, scriptId, "edge-en", "voix.mp3");
    const voiceId = Number(voice.lastInsertRowid);
    db.prepare("UPDATE projects SET selected_idea_id = NULL, selected_script_id = ?, selected_voice_id = ?, status = 'voice' WHERE id = ?").run(scriptId, voiceId, h.projectId);

    const res = await fetch(`${h.baseUrl}/projects/${h.projectId}/select-idea`, {
      method: "POST",
      body: JSON.stringify({ ideaId }),
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(res.status, 200);

    const row = db.prepare("SELECT selected_idea_id, selected_script_id, selected_voice_id, status FROM projects WHERE id = ?").get(h.projectId) as {
      selected_idea_id: number | null;
      selected_script_id: number | null;
      selected_voice_id: number | null;
      status: string;
    };
    assert.equal(row.selected_idea_id, ideaId);
    assert.equal(row.selected_script_id, null);
    assert.equal(row.selected_voice_id, null);
    assert.equal(row.status, "ideas");
  } finally {
    h.server.close();
  }
});

after(() => {
  closeDb();
});
