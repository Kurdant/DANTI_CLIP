import { test } from "node:test";
import assert from "node:assert/strict";
import type { LlmProvider } from "../src/llm/types.ts";
import { factCheckScript, assessFactCheck, messagesFactCheck, FACT_VERDICTS } from "../src/content-engine/fact-check.ts";

function fakeLlm(response: unknown): LlmProvider {
  return { name: "fake", complete: async () => JSON.stringify(response) };
}

test("script sain : aucune contestation, pas de blocage", async () => {
  const judge = fakeLlm({
    checks: [
      { claim: "Le cœur d'un poulpe s'arrête presque quand il nage", verdict: "fact", reason: "etabli" },
      { claim: "Ton cerveau anticipe ton reveil", verdict: "approximation", reason: "simplifie" },
    ],
  });
  const report = await factCheckScript(judge, "narration", "hook", "fr");
  assert.equal(report.blocking, false);
  assert.equal(report.checks.length, 2);
});

test("affirmation contestee : blocage avec raison", async () => {
  const judge = fakeLlm({
    checks: [{ claim: "On n'utilise que 10% de notre cerveau", verdict: "conteste", reason: "mythe demystifie" }],
  });
  const report = await factCheckScript(judge, "narration", "hook", "fr");
  assert.equal(report.blocking, true);
  assert.ok(report.blockingReasons[0].includes("10%"));
});

test("assessFactCheck : seul 'conteste' bloque", () => {
  const r = assessFactCheck([
    { claim: "a", verdict: "hypothese", reason: "" },
    { claim: "b", verdict: "non_verifiable", reason: "" },
    { claim: "c", verdict: "fact", reason: "" },
  ]);
  assert.equal(r.blocking, false);
  const r2 = assessFactCheck([{ claim: "c", verdict: "conteste", reason: "x" }]);
  assert.equal(r2.blocking, true);
});

test("les 5 qualifications du contrat sont supportees", () => {
  assert.deepEqual([...FACT_VERDICTS], ["fact", "approximation", "hypothese", "conteste", "non_verifiable"]);
});

test("reponse invalide : erreur explicite", async () => {
  await assert.rejects(() => factCheckScript(fakeLlm({ checks: [] }), "n", "h", "fr"), /structure invalide/);
  await assert.rejects(() => factCheckScript(fakeLlm("pas du json"), "n", "h", "fr"), /structure invalide|JSON invalide/);
});

test("le prompt demande d'extraire les affirmations critiques et d'interdire les mythes", () => {
  const text = messagesFactCheck({ scriptText: "texte", hook: "h", language: "fr" }).map((m) => m.content).join("\n");
  assert.ok(/3-6 CRITICAL factual claims/.test(text));
  assert.ok(/Never mark a claim as "fact" unless/.test(text));
  assert.ok(/conteste/.test(text));
});
