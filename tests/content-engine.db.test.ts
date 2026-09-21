import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb, closeDb } from "../server/src/db/db.ts";
import type { ServerEnv } from "../server/src/lib/env.ts";
import { setContentLogSink, resetContentLogSink } from "../src/content-engine/logging.ts";
import {
  saveIdeasAsCandidates,
  selectBestCandidateId,
  markCandidateSelected,
  ideaIdForCandidate,
  candidateForIdea,
  selectedCandidateForProject,
  saveHooks,
  selectBestHookId,
  bestHookText,
  markHookSelected,
  archiveProjectCandidates,
} from "../server/src/lib/contentEngine.ts";

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
  const dir = mkdtempSync(path.join(tmpdir(), "danti-content-"));
  const env = testEnv(path.join(dir, "t.db"));
  const db = getDb(env);
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run();
  return { env, db };
}

afterEach(() => {
  resetContentLogSink();
});

const STRONG = {
  scores: {
    demand: 0.9, curiosity: 0.9, emotionalImpact: 0.8, novelty: 0.9,
    visualPotential: 0.8, commentPotential: 0.8, sharePotential: 0.8,
    searchPotential: 0.7, audienceRelevance: 0.9, credibility: 0.9,
    saturation: 0.1, banality: 0.1, followUpPotential: 0.8,
  },
  penalties: { tooKnown: 0, lowVisual: 0, tooGeneric: 0, hardToProve: 0, lowCredibility: 0 },
  justification: "angle fort",
};
const WEAK = {
  scores: { ...STRONG.scores, demand: 0.3, curiosity: 0.3, novelty: 0.3 },
  penalties: STRONG.penalties,
  justification: "angle faible",
};

test("persistance : scores decomposes + meilleur candidat selectionne", () => {
  const { env, db } = newDb();
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (1, 'p', '', 'auto')").run();
  const projectId = Number(project.lastInsertRowid);

  const ids = saveIdeasAsCandidates(env, 1, projectId, [
    { sujet: "Sujet faible", titre: "T1" },
    { sujet: "Sujet fort", titre: "T2" },
    { sujet: "Sujet moyen", titre: "T3" },
  ], [WEAK, STRONG, WEAK]);

  const best = selectBestCandidateId(env, projectId);
  assert.equal(best, ids[1], "le candidat au meilleur score doit etre choisi");

  const rows = db.prepare("SELECT * FROM topic_candidates ORDER BY id").all() as { total_score: number | null; score_detail: string; demand_score: number | null; status: string }[];
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.ok(r.total_score != null, "score total manquant");
    const detail = JSON.parse(r.score_detail);
    assert.ok("positive" in detail && "penalties" in detail && "justification" in detail, "decomposition absente");
  }
  assert.ok(rows[1].total_score! > rows[0].total_score!);
  assert.equal(rows[0].demand_score, 0.3);
});

test("repli heuristique : fait surexploite rejete automatiquement", () => {
  const { env, db } = newDb();
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (1, 'p', '', 'auto')").run();
  const projectId = Number(project.lastInsertRowid);

  const ids = saveIdeasAsCandidates(env, 1, projectId, [
    { sujet: "Les poulpes ont trois cœurs", titre: "T" },
  ]);
  const row = db.prepare("SELECT * FROM topic_candidates WHERE id = ?").get(ids[0]) as { status: string; banality_score: number; total_score: number };
  assert.equal(row.status, "rejected");
  assert.ok(row.banality_score >= 0.8);
  assert.ok(row.total_score <= 0.1);
});

test("selection manuelle : marquage + liaison idee/candidat", () => {
  const { env, db } = newDb();
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (1, 'p', '', 'auto')").run();
  const projectId = Number(project.lastInsertRowid);
  const idea = db.prepare("INSERT INTO ideas (project_id, position, idea_text) VALUES (?, 1, ?)").run(projectId, "Sujet fort");
  const ideaId = Number(idea.lastInsertRowid);

  const ids = saveIdeasAsCandidates(env, 1, projectId, [{ sujet: "Sujet fort", titre: "T" }], [STRONG]);

  const linked = candidateForIdea(env, projectId, ideaId);
  assert.ok(linked, "candidat non relie a l'idee");
  assert.equal(linked!.id, ids[0]);

  markCandidateSelected(env, ids[0]);
  assert.equal(selectedCandidateForProject(env, projectId)?.id, ids[0]);
  assert.equal(ideaIdForCandidate(env, projectId, ids[0]), ideaId);
});

test("le meilleur candidat ignore les rejetes", () => {
  const { env, db } = newDb();
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (1, 'p', '', 'auto')").run();
  const projectId = Number(project.lastInsertRowid);

  saveIdeasAsCandidates(env, 1, projectId, [
    { sujet: "Sujet fort", titre: "T1" },
    { sujet: "Les poulpes ont trois cœurs", titre: "T2" },
  ], [STRONG, undefined]);

  const best = selectBestCandidateId(env, projectId);
  const row = db.prepare("SELECT title FROM topic_candidates WHERE id = ?").get(best) as { title: string };
  assert.equal(row.title, "T1");
  const poulpe = db.prepare("SELECT status FROM topic_candidates WHERE title = 'T2'").get() as { status: string };
  assert.equal(poulpe.status, "rejected");
});

test("archive des candidats : une generation remplacee ne peut plus etre selectionnee", () => {
  const { env, db } = newDb();
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (1, 'p', '', 'auto')").run();
  const projectId = Number(project.lastInsertRowid);

  saveIdeasAsCandidates(env, 1, projectId, [{ sujet: "Vieux sujet fort", titre: "vieux" }], [STRONG]);
  archiveProjectCandidates(env, projectId, "superseded: regeneration d'idees");
  const [newId] = saveIdeasAsCandidates(env, 1, projectId, [{ sujet: "Nouveau sujet moyen", titre: "nouveau" }], [WEAK]);

  const best = selectBestCandidateId(env, projectId);
  assert.equal(best, newId, "seul le candidat de la nouvelle generation est eligible");
  const oldRow = db.prepare("SELECT status, score_detail FROM topic_candidates WHERE title = 'vieux'").get() as { status: string; score_detail: string | null };
  assert.equal(oldRow.status, "rejected");
  assert.ok(oldRow.score_detail?.includes("superseded"));
});

test("hooks : persistance, selection du meilleur, rejet sous le seuil", () => {
  const { env, db } = newDb();
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (1, 'p', '', 'auto')").run();
  const projectId = Number(project.lastInsertRowid);
  const [candidateId] = saveIdeasAsCandidates(env, 1, projectId, [{ sujet: "Sujet fort", titre: "T" }], [STRONG]);

  const strongScores = { curiosity: 0.9, clarity: 0.9, specificity: 0.8, surprise: 0.8, emotionalImpact: 0.7, openLoop: 0.8, credibility: 0.9, scrollStoppingPotential: 0.8 };
  const weakScores = { curiosity: 0.2, clarity: 0.3, specificity: 0.2, surprise: 0.1, emotionalImpact: 0.2, openLoop: 0.1, credibility: 0.5, scrollStoppingPotential: 0.2 };

  const ids = saveHooks(env, candidateId, [
    { hook_text: "Hook faible", pattern: "question", scores: weakScores, justification: "trop vague" },
    { hook_text: "Ton cerveau fait quelque chose d'étrange.", pattern: "curiosity_gap", scores: strongScores, justification: "tension claire et honnete" },
  ]);
  assert.equal(ids.length, 2);

  const best = selectBestHookId(env, candidateId);
  assert.equal(best, ids[1], "le meilleur hook doit etre selectionne");
  assert.equal(bestHookText(env, candidateId), "Ton cerveau fait quelque chose d'étrange.");

  const weakRow = db.prepare("SELECT status FROM hooks WHERE id = ?").get(ids[0]) as { status: string };
  assert.equal(weakRow.status, "rejected", "hook sous le seuil doit etre rejete");

  markHookSelected(env, ids[1]);
  const strongRow = db.prepare("SELECT status FROM hooks WHERE id = ?").get(ids[1]) as { status: string };
  assert.equal(strongRow.status, "selected");

  const detail = db.prepare("SELECT score_detail FROM hooks WHERE id = ?").get(ids[1]) as { score_detail: string | null };
  assert.ok(detail.score_detail && detail.score_detail.length > 0, "la justification du hook doit etre persistee");
});

test("journal structure : TOPIC_DISCOVERED, TOPIC_REJECTED et HOOK_REJECTED emis", () => {
  const { env, db } = newDb();
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (1, 'p', '', 'auto')").run();
  const projectId = Number(project.lastInsertRowid);

  const lines: string[] = [];
  setContentLogSink((l) => lines.push(l));
  try {
    saveIdeasAsCandidates(env, 1, projectId, [{ sujet: "Les poulpes ont trois cœurs", titre: "T" }]);
  } finally {
    resetContentLogSink();
  }

  const events = lines.map((l) => JSON.parse(l).event);
  assert.ok(events.includes("TOPIC_DISCOVERED"));
  assert.ok(events.includes("TOPIC_REJECTED"));
  const rejected = lines.map((l) => JSON.parse(l)).find((e) => e.event === "TOPIC_REJECTED");
  assert.ok(rejected.data.reasons.length > 0);
});
