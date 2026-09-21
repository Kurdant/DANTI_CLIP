import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreTopic, scoreHook, type TopicEvaluation, type TopicScores } from "../src/content-engine/scoring.ts";
import { DEFAULT_TOPIC_SCORING, DEFAULT_HOOK_SCORING, TOPIC_CRITERIA, POSITIVE_CRITERIA, assertTopicScoringConfig } from "../src/content-engine/config.ts";

function evalBase(overrides: Partial<TopicScores> = {}, penalties: Partial<TopicEvaluation["penalties"]> = {}): TopicEvaluation {
  const scores: TopicScores = {
    demand: 0.8, curiosity: 0.9, emotionalImpact: 0.7, novelty: 0.8,
    visualPotential: 0.7, commentPotential: 0.6, sharePotential: 0.6,
    searchPotential: 0.5, audienceRelevance: 0.8, credibility: 0.8,
    saturation: 0.2, banality: 0.2, followUpPotential: 0.6,
    ...overrides,
  };
  const penaltiesAll = {
    tooKnown: 0, lowVisual: 0, tooGeneric: 0, hardToProve: 0, lowCredibility: 0,
    ...penalties,
  };
  return { scores, penalties: penaltiesAll, justification: "test" };
}

test("la config par defaut couvre les 13 criteres du contrat", () => {
  assert.equal(TOPIC_CRITERIA.length, 13);
  for (const c of TOPIC_CRITERIA) {
    assert.ok(c, `critere manquant : ${c}`);
  }
  assert.ok(TOPIC_CRITERIA.includes("emotionalImpact"), "emotionalImpact doit etre conserve");
  assert.ok(TOPIC_CRITERIA.includes("audienceRelevance"), "audienceRelevance doit etre conserve");
  assert.ok(TOPIC_CRITERIA.includes("credibility"), "credibility doit etre conserve");
  assert.ok(TOPIC_CRITERIA.includes("followUpPotential"), "followUpPotential doit etre conserve");
  assert.equal(POSITIVE_CRITERIA.length, 11);
});

test("la somme des poids positifs par defaut est coherente", () => {
  const sum = POSITIVE_CRITERIA.reduce((acc, c) => acc + DEFAULT_TOPIC_SCORING.weights[c], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `somme = ${sum}`);
  assertTopicScoringConfig(DEFAULT_TOPIC_SCORING);
});

test("candidat solide : score eleve, pas de rejet", () => {
  const r = scoreTopic(evalBase(), DEFAULT_TOPIC_SCORING);
  assert.ok(r.total > 0.6, `total=${r.total}`);
  assert.equal(r.rejected, false);
  assert.deepEqual(r.reasons, []);
  assert.ok(r.total === Math.max(0, Math.min(1, r.positive - r.penalties)));
});

test("la banalite et la saturation penalisent le score", () => {
  const clean = scoreTopic(evalBase(), DEFAULT_TOPIC_SCORING);
  const banal = scoreTopic(evalBase({ banality: 0.9, saturation: 0.7 }), DEFAULT_TOPIC_SCORING);
  assert.ok(banal.total < clean.total, `banal=${banal.total} clean=${clean.total}`);
  assert.ok(banal.penalties > 0);
});

test("banalite au-dessus du seuil : rejet automatique avec raison", () => {
  const r = scoreTopic(evalBase({ banality: 0.9 }), DEFAULT_TOPIC_SCORING);
  assert.equal(r.rejected, true);
  assert.ok(r.reasons.some((s) => s.startsWith("banality=")));
});

test("credibilite insuffisante : rejet automatique", () => {
  const r = scoreTopic(evalBase({ credibility: 0.1 }), DEFAULT_TOPIC_SCORING);
  assert.equal(r.rejected, true);
  assert.ok(r.reasons.some((s) => s.startsWith("credibility=")));
});

test("score total sous le seuil : rejet automatique (seuil effectif)", () => {
  const weak = evalBase({
    demand: 0.2, curiosity: 0.2, emotionalImpact: 0.1, novelty: 0.2,
    visualPotential: 0.2, commentPotential: 0.1, sharePotential: 0.1,
    searchPotential: 0.1, audienceRelevance: 0.2, credibility: 0.4,
    saturation: 0.5, banality: 0.4, followUpPotential: 0.2,
  });
  const r = scoreTopic(weak, DEFAULT_TOPIC_SCORING);
  assert.equal(r.rejected, true);
  assert.ok(r.reasons.some((s) => s.startsWith("total=")), `raisons=${r.reasons.join(";")}`);
});

test("les drapeaux de penalite reduisent le score (trop connu, trop generique)", () => {
  const clean = scoreTopic(evalBase(), DEFAULT_TOPIC_SCORING);
  const flagged = scoreTopic(evalBase({}, { tooKnown: 1, tooGeneric: 1 }), DEFAULT_TOPIC_SCORING);
  assert.ok(flagged.total < clean.total);
});

test("valeurs hors bornes ou non finies : bornees, jamais NaN", () => {
  const r = scoreTopic(evalBase({ demand: 5, banality: -3 }), DEFAULT_TOPIC_SCORING);
  assert.ok(Number.isFinite(r.total));
  assert.ok(r.total >= 0 && r.total <= 1);
  const r2 = scoreTopic(evalBase({ demand: NaN }), DEFAULT_TOPIC_SCORING);
  assert.ok(Number.isFinite(r2.total));
});

test("score final toujours dans [0,1] meme avec toutes les penalites", () => {
  const r = scoreTopic(
    evalBase({ banality: 1, saturation: 1 }, { tooKnown: 1, lowVisual: 1, tooGeneric: 1, hardToProve: 1, lowCredibility: 1 }),
    DEFAULT_TOPIC_SCORING,
  );
  assert.ok(r.total >= 0 && r.total <= 1);
  assert.equal(r.rejected, true);
});

test("hook : score pondere borne, un hook faible reste bas", () => {
  const strong = scoreHook(
    { curiosity: 0.9, clarity: 0.9, specificity: 0.8, surprise: 0.8, emotionalImpact: 0.7, openLoop: 0.8, credibility: 0.9, scrollStoppingPotential: 0.8 },
    DEFAULT_HOOK_SCORING,
  );
  const weak = scoreHook(
    { curiosity: 0.2, clarity: 0.3, specificity: 0.2, surprise: 0.1, emotionalImpact: 0.2, openLoop: 0.1, credibility: 0.5, scrollStoppingPotential: 0.2 },
    DEFAULT_HOOK_SCORING,
  );
  assert.ok(strong > DEFAULT_HOOK_SCORING.minTotalScore);
  assert.ok(weak < DEFAULT_HOOK_SCORING.minTotalScore);
  assert.ok(strong > weak);
});

test("les poids du hook couvrent les 8 criteres du contrat", () => {
  const keys = Object.keys(DEFAULT_HOOK_SCORING.weights);
  assert.equal(keys.length, 8);
  assert.ok(keys.includes("scrollStoppingPotential"));
  assert.ok(keys.includes("openLoop"));
});
