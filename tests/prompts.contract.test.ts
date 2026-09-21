import { test } from "node:test";
import assert from "node:assert/strict";
import { messagesIdees, messagesScript } from "../src/prompts.ts";
import { messagesIdeesTest, messagesScriptTest } from "../src/prompts-test.ts";

/** Concatene system + user d'un echange. */
function fullText(messages: { role: string; content: string }[]): string {
  return messages.map((m) => m.content).join("\n");
}

const forbidden = [
  ["25 to 35 seconds", "duree fixe 25-35s"],
  ["25-35s", "duree fixe 25-35s"],
  ["MAX ~140 words", "budget de mots fixe"],
  ["MANDATORY HOOK OPENER", "opener Your/You impose"],
  ["ALWAYS in English", "anglais impose"],
  ["SINGLE LANGUAGE ENGLISH", "anglais impose"],
  ["must ECHO the opening hook", "boucle obligatoire"],
];

for (const family of [
  { name: "prod idees", fn: () => messagesIdees({ topic: "", nIdeas: 3, language: "fr" }) },
  { name: "prod script", fn: () => messagesScript({ idea: "un fait", language: "fr" }) },
  { name: "test idees", fn: () => messagesIdeesTest({ topic: "", nIdeas: 3, language: "fr" }) },
  { name: "test script", fn: () => messagesScriptTest({ idea: "un fait", language: "fr" }) },
]) {
  test(`${family.name} : aucune ancienne regle contradictoire`, () => {
    const text = fullText(family.fn());
    for (const [needle, label] of forbidden) {
      assert.ok(!text.includes(needle), `${label} encore present ("${needle}")`);
    }
  });

  test(`${family.name} : la langue demandee est transmise et obeie`, () => {
    const text = fullText(family.fn());
    assert.ok(text.includes("Language : fr"), "directive de langue absente");
    assert.ok(/language given in the user message/i.test(text), "regle de langue pas pilote par le parametre");
  });

  test(`${family.name} : la duree est adaptative, pas verrouillee`, () => {
    const text = fullText(family.fn());
    assert.ok(/NO fixed total duration|the duration the topic actually needs/i.test(text), "duree adaptative absente");
  });

  test(`${family.name} : regles editoriales du contrat presentes`, () => {
    const text = fullText(family.fn());
    assert.ok(/did you know/i.test(text), "interdiction 'Saviez-vous que' absente");
    assert.ok(/HONESTY|verifiable facts/i.test(text), "regle d'honnetete absente");
    assert.ok(/never forced|never a gimmick/i.test(text), "payoff non-gimmick absent");
  });
}

test("les sujets surexploites sont explicitement interdits (anti-banalite)", () => {
  const text = fullText(messagesIdees({ topic: "", nIdeas: 3, language: "fr" }));
  assert.ok(/three-heart octopus/i.test(text));
  assert.ok(/lightning\s+hotter than the sun/i.test(text));
  assert.ok(/bees' dance/i.test(text));
});
