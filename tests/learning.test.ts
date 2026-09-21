import { test } from "node:test";
import assert from "node:assert/strict";
import {
  durationBucket,
  withinRecency,
  aggregateByDimension,
  buildRecommendation,
  type VideoObservation,
} from "../src/content-engine/learning.ts";

function obs(partial: Partial<VideoObservation>): VideoObservation {
  return { videoId: 1, views: null, likes: null, comments: null, capturedAt: null, category: null, hookPattern: null, durationSec: null, ...partial };
}

test("durationBucket : bornes stables", () => {
  assert.equal(durationBucket(10), "0-15s");
  assert.equal(durationBucket(15), "15-30s");
  assert.equal(durationBucket(29.9), "15-30s");
  assert.equal(durationBucket(30), "30-45s");
  assert.equal(durationBucket(44.9), "30-45s");
  assert.equal(durationBucket(45), "45s+");
  assert.equal(durationBucket(200), "45s+");
  assert.equal(durationBucket(null), null);
});

test("withinRecency : filtre par fenetre, conserve les sans date", () => {
  const recent = new Date(Date.now() - 1000 * 3600).toISOString();
  const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const list = [obs({ capturedAt: recent }), obs({ capturedAt: old }), obs({ capturedAt: null })];
  assert.equal(withinRecency(list, 30).length, 2);
});

test("aggregateByDimension : echantillon, mediane, confiance", () => {
  const rows = [
    obs({ videoId: 1, category: "body", views: 100 }),
    obs({ videoId: 2, category: "body", views: 200 }),
    obs({ videoId: 3, category: "body", views: 900 }),
    obs({ videoId: 4, category: "space", views: 10 }),
  ];
  const stats = aggregateByDimension(rows, (o) => o.category, 3);
  assert.equal(stats.length, 2);
  const body = stats.find((s) => s.value === "body")!;
  assert.equal(body.sampleSize, 3);
  assert.equal(body.medianViews, 200);
  assert.equal(body.confidence, 1);
  const space = stats.find((s) => s.value === "space")!;
  assert.equal(space.confidence, 1 / 3);
  assert.ok(stats[0].score >= stats[1].score);
});

test("aggregateByDimension : une video multi-categories ne compte qu'une fois", () => {
  const rows = [
    obs({ videoId: 1, category: "body", views: 100 }),
    obs({ videoId: 1, category: "psychology", views: 100 }),
    obs({ videoId: 1, category: "animals", views: 100 }),
  ];
  const stats = aggregateByDimension(rows, (o) => o.category, 3);
  assert.equal(stats.length, 3);
  for (const s of stats) {
    assert.equal(s.sampleSize, 1, "chaque categorie doit compter 1 video unique");
    assert.equal(s.confidence, 1 / 3);
  }
});

test("aggregateByDimension : valeurs null ignorees, taux calcules", () => {
  const rows = [
    obs({ videoId: 1, category: "body", views: 100, likes: 10, comments: 5 }),
    obs({ videoId: 2, category: "body", views: 200, likes: 10, comments: 1 }),
    obs({ videoId: 3, category: "body", views: null }),
  ];
  const stats = aggregateByDimension(rows, (o) => o.category, 2);
  const body = stats[0];
  assert.equal(body.sampleSize, 3);
  assert.ok(Math.abs(body.meanLikeRate! - 0.075) < 1e-9);
  assert.ok(Math.abs(body.meanCommentRate! - 0.0275) < 1e-9);
});

test("recommendation sans donnees : exploration explicable", () => {
  const r = buildRecommendation([], [], [], { explorationRate: 0.2, minSampleSize: 5 });
  assert.equal(r.mode, "explore");
  assert.equal(r.confidence, null);
  assert.ok(r.reasons.some((s) => s.includes("echantillon insuffisant")));
});

test("recommendation avec echantillon insuffisant partout : exploration", () => {
  const byHook = aggregateByDimension([obs({ hookPattern: "question", views: 10 })], (o) => o.hookPattern, 5);
  const r = buildRecommendation([], byHook, [], { explorationRate: 0, minSampleSize: 5 });
  assert.equal(r.mode, "explore");
});

test("recommendation avec donnees suffisantes : exploitation du meilleur pattern", () => {
  const rows: VideoObservation[] = [];
  for (let i = 0; i < 6; i++) rows.push(obs({ videoId: i + 1, hookPattern: "experience", views: 2000 + i, likes: 100, comments: 20 }));
  for (let i = 0; i < 6; i++) rows.push(obs({ videoId: 100 + i, hookPattern: "mystery", views: 300 + i, likes: 10, comments: 5 }));
  const byHook = aggregateByDimension(rows, (o) => o.hookPattern, 5);
  const r = buildRecommendation([], byHook, [], { explorationRate: 0, minSampleSize: 5 });
  assert.equal(r.mode, "exploit");
  assert.equal(r.hookPattern, "experience");
  assert.ok(r.reasons.some((s) => s.includes("experience")));
  assert.ok(r.basedOnSampleSize >= 6);
});

test("recommendation : le tirage d'exploration est respecte (random injecte)", () => {
  const rows: VideoObservation[] = [];
  for (let i = 0; i < 6; i++) rows.push(obs({ videoId: i + 1, hookPattern: "experience", views: 2000 }));
  const byHook = aggregateByDimension(rows, (o) => o.hookPattern, 5);
  const alwaysExplore = buildRecommendation([], byHook, [], { explorationRate: 0.2, minSampleSize: 5, random: () => 0.1 });
  assert.equal(alwaysExplore.mode, "explore");
  const neverExplore = buildRecommendation([], byHook, [], { explorationRate: 0.2, minSampleSize: 5, random: () => 0.9 });
  assert.equal(neverExplore.mode, "exploit");
});

test("recommendation : aucune causalite proclamee", () => {
  const rows: VideoObservation[] = [];
  for (let i = 0; i < 6; i++) rows.push(obs({ videoId: i + 1, category: "body", views: 1000 }));
  const byCat = aggregateByDimension(rows, (o) => o.category, 5);
  const r = buildRecommendation(byCat, [], [], { explorationRate: 0, minSampleSize: 5 });
  assert.equal(r.mode, "exploit");
  assert.ok(r.reasons.every((s) => !/cause|provoque|determine/i.test(s)), "langage causal interdit");
});
