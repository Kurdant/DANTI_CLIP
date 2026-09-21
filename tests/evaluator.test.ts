import { test } from "node:test";
import assert from "node:assert/strict";
import type { LlmProvider } from "../src/llm/types.ts";
import { evaluateTopics, evaluateHooks, messagesTopicEvaluation } from "../src/content-engine/evaluator.ts";

function fakeLlm(response: unknown): LlmProvider {
  return {
    name: "fake",
    complete: async () => JSON.stringify(response),
  };
}

const GOOD_EVALUATION = {
  scores: {
    demand: 0.8, curiosity: 0.9, emotionalImpact: 0.7, novelty: 0.8,
    visualPotential: 0.7, commentPotential: 0.6, sharePotential: 0.6,
    searchPotential: 0.5, audienceRelevance: 0.8, credibility: 0.8,
    saturation: 0.2, banality: 0.2, followUpPotential: 0.6,
  },
  penalties: { tooKnown: 0, lowVisual: 0, tooGeneric: 0, hardToProve: 0, lowCredibility: 0 },
  justification: "angle peu connu et concret",
};

test("evaluation d'un lot de candidats : parse et ordre preserves", async () => {
  const llm = fakeLlm({
    evaluations: [
      GOOD_EVALUATION,
      { ...GOOD_EVALUATION, scores: { ...GOOD_EVALUATION.scores, banality: 0.9 }, justification: "fact connu" },
    ],
  });
  const out = await evaluateTopics(llm, ["candidat A", "candidat B"], "fr");
  assert.equal(out.length, 2);
  assert.equal(out[1].scores.banality, 0.9);
  assert.equal(out[0].scores.curiosity, 0.9);
});

test("nombre d'evaluations different du lot : erreur explicite", async () => {
  const llm = fakeLlm({ evaluations: [GOOD_EVALUATION] });
  await assert.rejects(() => evaluateTopics(llm, ["A", "B"], "fr"), /2 evaluations pour|1 evaluations/);
});

test("reponse invalide (scores hors bornes ou JSON casse) : erreur", async () => {
  await assert.rejects(
    () => evaluateTopics(fakeLlm("pas du json"), ["A"], "fr"),
    /JSON invalide|structure invalide/,
  );
  const bad = { evaluations: [{ ...GOOD_EVALUATION, scores: { ...GOOD_EVALUATION.scores, demand: 7 } }] };
  await assert.rejects(() => evaluateTopics(fakeLlm(bad), ["A"], "fr"), /structure invalide/);
});

test("les valeurs numeriques en chaine sont acceptees (coercition)", async () => {
  const asStrings = {
    evaluations: [{
      scores: Object.fromEntries(Object.entries(GOOD_EVALUATION.scores).map(([k, v]) => [k, String(v)])),
      penalties: Object.fromEntries(Object.entries(GOOD_EVALUATION.penalties).map(([k, v]) => [k, String(v)])),
      justification: "",
    }],
  };
  const out = await evaluateTopics(fakeLlm(asStrings), ["A"], "fr");
  assert.equal(out[0].scores.demand, 0.8);
});

test("evaluation de hooks : 8 criteres parses", async () => {
  const llm = fakeLlm({
    evaluations: [
      {
        scores: { curiosity: 0.9, clarity: 0.9, specificity: 0.8, surprise: 0.8, emotionalImpact: 0.7, openLoop: 0.8, credibility: 0.9, scrollStoppingPotential: 0.8 },
        justification: "hook efficace",
      },
    ],
  });
  const out = await evaluateHooks(llm, ["Ton cerveau fait quelque chose d'étrange."], "fr");
  assert.equal(out.length, 1);
  assert.equal(out[0].scores.openLoop, 0.8);
});

test("le prompt d'evaluation contient les 13 criteres (pas de perte de critere)", () => {
  const msgs = messagesTopicEvaluation({ candidates: ["A"], language: "fr" });
  const text = msgs.map((m) => m.content).join("\n");
  for (const c of ["demand", "curiosity", "emotionalImpact", "novelty", "visualPotential", "commentPotential", "sharePotential", "searchPotential", "audienceRelevance", "credibility", "saturation", "banality", "followUpPotential"]) {
    assert.ok(text.includes(c), `critere manquant dans le prompt : ${c}`);
  }
});
