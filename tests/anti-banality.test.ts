import { test } from "node:test";
import assert from "node:assert/strict";
import { overusedMatches, banalityHint, isBareFact, fallbackEvaluation, normalizeFact } from "../src/content-engine/anti-banality.ts";

test("normalisation : accents, casse et ponctuation ignores", () => {
  assert.equal(normalizeFact("Les poulpes ont trois cœurs !"), "les poulpes ont trois coeurs");
  assert.equal(normalizeFact("  Eiffel   Tower... "), "eiffel tower");
});

test("les faits surexploites sont detectes", () => {
  assert.deepEqual(overusedMatches("Les poulpes ont trois cœurs"), ["poulpe trois coeurs"]);
  assert.ok(overusedMatches("Honey never expires, it's eternal").length > 0);
  assert.deepEqual(overusedMatches("Ton cerveau anticipe ton reveil"), []);
});

test("banalityHint : 0 sans correspondance, eleve sinon", () => {
  assert.equal(banalityHint("Ton cerveau anticipe ton reveil"), 0);
  assert.ok(banalityHint("Les poulpes ont trois cœurs") >= 0.75);
});

test("isBareFact : fait brut vs angle de second niveau", () => {
  assert.equal(isBareFact("Les poulpes ont trois cœurs"), true);
  assert.equal(isBareFact("Pourquoi le cœur d'un poulpe s'arrête quand il nage"), false);
  assert.equal(isBareFact("Une explication de niveau deux avec un mecanisme inattendu derriere ce phenomene du quotidien qui devient completement etrange"), false);
});

test("fallbackEvaluation : neutre et honnete, durci si fait surexploite", () => {
  const neutral = fallbackEvaluation("Un phenomene du quotidien peu connu mais concret et original");
  assert.equal(neutral.scores.demand, 0.5);
  assert.ok(neutral.justification.includes("indisponible"));
  assert.equal(neutral.penalties.tooKnown, 0);

  const overused = fallbackEvaluation("Les poulpes ont trois cœurs");
  assert.equal(overused.penalties.tooKnown, 1);
  assert.ok(overused.scores.banality >= 0.8);
  assert.ok(overused.justification.includes("poulpe"));
});
