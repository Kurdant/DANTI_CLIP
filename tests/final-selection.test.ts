import { test } from "node:test";
import assert from "node:assert/strict";
import type { LlmProvider } from "../src/llm/types.ts";
import { selectFinalContent, messagesFinalSelection, type FinalCandidateInput } from "../src/content-engine/final-selection.ts";

function fakeLlm(response: unknown): LlmProvider {
  return { name: "fake", complete: async () => JSON.stringify(response) };
}

const CANDIDATES: FinalCandidateInput[] = [
  {
    index: 1, title: "A", idea_text: "Concept A", angle: "curiosite",
    total: 0.72, banality: 0.1, credibility: 0.9,
    hooks: [{ index: 1, text: "Hook A1", pattern: "curiosity_gap", total: 0.8 }],
  },
  {
    index: 2, title: "B", idea_text: "Concept B", angle: "contraire",
    total: 0.7, banality: 0.2, credibility: 0.8,
    hooks: [
      { index: 1, text: "Hook B1", pattern: "experience", total: 0.7 },
      { index: 2, text: "Hook B2", pattern: "question", total: 0.9 },
    ],
  },
];

test("selection finale : reponse valide parse", async () => {
  const judge = fakeLlm({ candidate_index: 2, hook_index: 2, justification: "B2 plus fort" });
  const out = await selectFinalContent(judge, CANDIDATES, "fr");
  assert.deepEqual(out, { candidateIndex: 2, hookIndex: 2, justification: "B2 plus fort" });
});

test("selection finale : reponse invalide ou hors bornes -> erreur", async () => {
  await assert.rejects(() => selectFinalContent(fakeLlm("pas du json"), CANDIDATES, "fr"), /JSON invalide|structure invalide/);
  await assert.rejects(() => selectFinalContent(fakeLlm({ candidate_index: 99, hook_index: 1 }), CANDIDATES, "fr"), /structure invalide/);
  await assert.rejects(() => selectFinalContent(fakeLlm({ candidate_index: 1, hook_index: 0 }), CANDIDATES, "fr"), /structure invalide/);
});

test("le prompt de selection contient candidats, scores et hooks", () => {
  const text = messagesFinalSelection({ candidates: CANDIDATES, language: "fr" }).map((m) => m.content).join("\n");
  assert.ok(text.includes("Concept B"));
  assert.ok(text.includes("0.72"));
  assert.ok(text.includes("Hook B2"));
  assert.ok(/banality/.test(text));
  assert.ok(/Do NOT pick/.test(text), "regle anti-banalite absente");
});
