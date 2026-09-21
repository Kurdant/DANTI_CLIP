import { test } from "node:test";
import assert from "node:assert/strict";
import type { LlmProvider } from "../src/llm/types.ts";
import { generateHooks, messagesHookGeneration, HOOK_PATTERNS } from "../src/content-engine/hooks.ts";
import { messagesScript } from "../src/prompts.ts";
import { messagesScriptTest } from "../src/prompts-test.ts";

function fakeLlm(response: unknown): LlmProvider {
  return { name: "fake", complete: async () => JSON.stringify(response) };
}

const VARIANTS = [
  { hook_text: "Ton cerveau fait quelque chose d'étrange quand tu t'endors.", pattern: "curiosity_gap" },
  { hook_text: "Tu as déjà vécu ça sans savoir pourquoi.", pattern: "experience" },
  { hook_text: "Ce que tu crois normal ne l'est pas vraiment.", pattern: "contradiction" },
  { hook_text: "Pourquoi ton corps fait-il ça tout seul ?", pattern: "question" },
  { hook_text: "Et cette petite chose change tout ensuite.", pattern: "unexpected_consequence" },
  { hook_text: "Pendant quelques secondes, ton cerveau ne sait plus quoi faire.", pattern: "mystery" },
];

test("generation de hooks : variantes parsees avec leurs patterns", async () => {
  const out = await generateHooks(fakeLlm({ hooks: VARIANTS }), "Le sommeil", { language: "fr", count: 6 });
  assert.equal(out.length, 6);
  assert.equal(out[0].hook_text, "Ton cerveau fait quelque chose d'étrange quand tu t'endors.");
  assert.equal(out[0].pattern, "curiosity_gap");
});

test("reponse invalide : erreur explicite", async () => {
  await assert.rejects(() => generateHooks(fakeLlm("pas du json"), "X", { count: 3 }), /JSON invalide|structure invalide/);
  await assert.rejects(() => generateHooks(fakeLlm({ hooks: [] }), "X", { count: 3 }), /structure invalide|variantes/);
});

test("moins de 3 variantes pour 6 demandees : rejet (variete garantie)", async () => {
  const one = fakeLlm({ hooks: [VARIANTS[0]] });
  await assert.rejects(() => generateHooks(one, "X", { count: 6 }), /variantes/);
});

test("le prompt de generation couvre les 7 patterns du contrat", () => {
  const text = messagesHookGeneration({ topic: "T", count: 6 }).map((m) => m.content).join("\n");
  for (const p of HOOK_PATTERNS) {
    assert.ok(text.includes(p), `pattern manquant : ${p}`);
  }
});

test("le prompt de generation respecte les regles editoriales", () => {
  const text = messagesHookGeneration({ topic: "T", count: 6 }).map((m) => m.content).join("\n");
  assert.ok(/did you know/i.test(text), "interdiction 'Saviez-vous que' absente");
  assert.ok(/NEVER give the full answer/i.test(text), "regle de reponse differee absente");
  assert.ok(/MAX 12 words/i.test(text));
  assert.ok(/No clickbait lie/i.test(text), "regle d'honnetete absente");
});

test("script : le hook selectionne est impose verbatim (prod et test)", () => {
  const hook = "Ton cerveau fait quelque chose d'étrange quand tu t'endors.";
  for (const fn of [messagesScript, messagesScriptTest]) {
    const text = fn({ idea: "Le sommeil", language: "fr", hook }).map((m) => m.content).join("\n");
    assert.ok(text.includes(`FIXED HOOK`), "directive de hook fixe absente");
    assert.ok(text.includes(hook), "le hook choisi n'est pas dans le prompt");
    assert.ok(/verbatim, no rephrasing/.test(text));
  }
});

test("script sans hook : aucune directive de hook fixe (comportement existant)", () => {
  const text = messagesScript({ idea: "X", language: "fr" }).map((m) => m.content).join("\n");
  assert.ok(!text.includes("FIXED HOOK"));
});
