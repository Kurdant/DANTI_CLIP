import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb, closeDb } from "../server/src/db/db.ts";
import type { ServerEnv } from "../server/src/lib/env.ts";
import { refreshUserVideoStats } from "../server/src/lib/ytStats.ts";
import { deriveRates, summarize, metricsOf } from "../src/content-engine/analytics.ts";
import { setContentLogSink, resetContentLogSink } from "../src/content-engine/logging.ts";

function testEnv(dbPath: string): ServerEnv {
  return {
    port: 0, dataDir: path.dirname(dbPath), dbPath,
    outputDir: "", backgroundsDir: "", userBackgroundsDir: "", userMascotsDir: "",
    userBgQuotaBytes: 0, cookieSecure: false, trustProxy: 0,
    adminUsername: "a", adminPassword: "a", sessionDays: 30,
    youtubeClientId: "", youtubeClientSecret: "", youtubeRedirectUri: "",
    youtubeApiKey: "fake-key", secretKey: "", pexelsApiKey: "", musicDir: "", sfxDir: "",
  };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetContentLogSink();
});

function mockFetch(items: unknown[]): void {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ items }),
  })) as unknown as typeof fetch;
}

test("refresh : met a jour la video ET historise un snapshot", async () => {
  closeDb();
  const dir = mkdtempSync(path.join(tmpdir(), "danti-ytstats-"));
  const env = testEnv(path.join(dir, "t.db"));
  const db = getDb(env);
  const user = db.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run();
  const userId = Number(user.lastInsertRowid);
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (?, 'p', '', 'auto')").run(userId);
  const projectId = Number(project.lastInsertRowid);
  const video = db.prepare("INSERT INTO videos (project_id, file_name, youtube_id) VALUES (?, 'v.mp4', 'abc123')").run(projectId);
  const videoId = Number(video.lastInsertRowid);

  mockFetch([{ id: "abc123", statistics: { viewCount: "1200", likeCount: "80", commentCount: "12" } }]);

  const r = await refreshUserVideoStats(env, userId);
  assert.equal(r.updated, 1);

  const vrow = db.prepare("SELECT views, likes, comments, stats_status FROM videos WHERE id = ?").get(videoId) as { views: number; likes: number; comments: number; stats_status: string };
  assert.equal(vrow.views, 1200);
  assert.equal(vrow.likes, 80);
  assert.equal(vrow.comments, 12);
  assert.equal(vrow.stats_status, "ok");

  const snaps = db.prepare("SELECT * FROM video_stats WHERE video_id = ?").all(videoId) as { views: number | null; likes: number | null; comments: number | null; source: string }[];
  assert.equal(snaps.length, 1, "un snapshot doit etre historise");
  assert.equal(snaps[0].views, 1200);
  assert.equal(snaps[0].source, "youtube_data_api");
});

test("refresh : l'historique s'accumule (pas d'ecrasement)", async () => {
  closeDb();
  const dir = mkdtempSync(path.join(tmpdir(), "danti-ytstats-"));
  const env = testEnv(path.join(dir, "t.db"));
  const db = getDb(env);
  const user = db.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run();
  const userId = Number(user.lastInsertRowid);
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (?, 'p', '', 'auto')").run(userId);
  const projectId = Number(project.lastInsertRowid);
  const video = db.prepare("INSERT INTO videos (project_id, file_name, youtube_id) VALUES (?, 'v.mp4', 'abc123')").run(projectId);
  const videoId = Number(video.lastInsertRowid);

  mockFetch([{ id: "abc123", statistics: { viewCount: "100" } }]);
  await refreshUserVideoStats(env, userId);
  db.prepare("UPDATE videos SET stats_updated_at = NULL WHERE id = ?").run(videoId);
  mockFetch([{ id: "abc123", statistics: { viewCount: "250" } }]);
  await refreshUserVideoStats(env, userId);

  const snaps = db.prepare("SELECT views FROM video_stats WHERE video_id = ? ORDER BY id").all(videoId) as { views: number | null }[];
  assert.equal(snaps.length, 2, "deux captures attendues");
  assert.equal(snaps[0].views, 100);
  assert.equal(snaps[1].views, 250);
});

test("refresh : compteurs absents -> null dans le snapshot ET sur la video (pas de faux zero)", async () => {
  closeDb();
  const dir = mkdtempSync(path.join(tmpdir(), "danti-ytstats-"));
  const env = testEnv(path.join(dir, "t.db"));
  const db = getDb(env);
  const user = db.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run();
  const userId = Number(user.lastInsertRowid);
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (?, 'p', '', 'auto')").run(userId);
  const projectId = Number(project.lastInsertRowid);
  const video = db.prepare("INSERT INTO videos (project_id, file_name, youtube_id) VALUES (?, 'v.mp4', 'abc123')").run(projectId);
  const videoId = Number(video.lastInsertRowid);

  mockFetch([{ id: "abc123", statistics: {} }]);
  await refreshUserVideoStats(env, userId);

  const snap = db.prepare("SELECT views, likes, comments FROM video_stats WHERE video_id = ?").get(videoId) as { views: number | null; likes: number | null; comments: number | null };
  assert.equal(snap.views, null);
  assert.equal(snap.likes, null);
  assert.equal(snap.comments, null);
  const vrow = db.prepare("SELECT views FROM videos WHERE id = ?").get(videoId) as { views: number | null };
  assert.equal(vrow.views, null, "la colonne video doit aussi rester null (honnetete)");
});

test("video absente de la reponse : statut missing, sans snapshot", async () => {
  closeDb();
  const dir = mkdtempSync(path.join(tmpdir(), "danti-ytstats-"));
  const env = testEnv(path.join(dir, "t.db"));
  const db = getDb(env);
  const user = db.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run();
  const userId = Number(user.lastInsertRowid);
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (?, 'p', '', 'auto')").run(userId);
  const projectId = Number(project.lastInsertRowid);
  const video = db.prepare("INSERT INTO videos (project_id, file_name, youtube_id) VALUES (?, 'v.mp4', 'abc123')").run(projectId);
  const videoId = Number(video.lastInsertRowid);

  mockFetch([]);
  const r = await refreshUserVideoStats(env, userId);
  assert.equal(r.missing, 1);
  const vrow = db.prepare("SELECT stats_status FROM videos WHERE id = ?").get(videoId) as { stats_status: string };
  assert.equal(vrow.stats_status, "missing");
  const count = (db.prepare("SELECT COUNT(*) AS n FROM video_stats WHERE video_id = ?").get(videoId) as { n: number }).n;
  assert.equal(count, 0);
});

test("ANALYTICS_UPDATED est emis lors d'un refresh fructueux", async () => {
  closeDb();
  const dir = mkdtempSync(path.join(tmpdir(), "danti-ytstats-"));
  const env = testEnv(path.join(dir, "t.db"));
  const db = getDb(env);
  const user = db.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run();
  const userId = Number(user.lastInsertRowid);
  const project = db.prepare("INSERT INTO projects (user_id, title, topic, mode) VALUES (?, 'p', '', 'auto')").run(userId);
  const projectId = Number(project.lastInsertRowid);
  db.prepare("INSERT INTO videos (project_id, file_name, youtube_id) VALUES (?, 'v.mp4', 'abc123')").run(projectId);

  mockFetch([{ id: "abc123", statistics: { viewCount: "10" } }]);
  const lines: string[] = [];
  setContentLogSink((l) => lines.push(l));
  await refreshUserVideoStats(env, userId);
  const events = lines.map((l) => JSON.parse(l).event);
  assert.ok(events.includes("ANALYTICS_UPDATED"));
});

test("taux derives : denominateur protege, absents = null", () => {
  assert.deepEqual(deriveRates({ views: 100, likes: 10, comments: 5 }), { likeRate: 0.1, commentRate: 0.05 });
  assert.deepEqual(deriveRates({ views: 0, likes: 10, comments: 5 }), { likeRate: null, commentRate: null });
  assert.deepEqual(deriveRates({ views: null, likes: 10, comments: 5 }), { likeRate: null, commentRate: null });
  assert.deepEqual(deriveRates({ views: 100, likes: null, comments: null }), { likeRate: null, commentRate: null });
});

test("resume d'echantillon : moyenne et mediane, robuste aux absents", () => {
  const s = summarize([100, 200, 900]);
  assert.equal(s.count, 3);
  assert.equal(s.mean, 400);
  assert.equal(s.median, 200);
  assert.deepEqual(summarize([]), { count: 0, sum: 0, mean: null, median: null });
  assert.deepEqual(summarize([NaN, 10, 20]), { count: 2, sum: 30, mean: 15, median: 15 });
});

test("metriques d'une ligne : non numeriques -> null", () => {
  assert.deepEqual(metricsOf({ views: 5, likes: undefined, comments: "x" as unknown as number | null }), { views: 5, likes: null, comments: null });
});
