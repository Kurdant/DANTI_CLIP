import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLlmJson,
  ideasResultSchema,
  scriptResultSchema,
  imageQueriesSchema,
} from "../src/llm/schemas.ts";

test("idees valides : parse ok, valeurs par defaut appliquees", () => {
  const raw = JSON.stringify({
    idees: [
      { sujet: "Pourquoi ton cerveau anticipe ton reveil", titre: "Ton reveil interne", hook: "Ton corps se reveille avant ton reveil.", angle: "curiosite", fond: "chambre au matin" },
      { sujet: "La canette froide devient mouillee" },
    ],
  });
  const parsed = parseLlmJson(ideasResultSchema, raw, "idees");
  assert.equal(parsed.idees.length, 2);
  assert.equal(parsed.idees[1].titre, "");
  assert.equal(parsed.idees[1].angle, "");
});

test("idees vides ou JSON invalide : erreur explicite", () => {
  assert.throws(() => parseLlmJson(ideasResultSchema, JSON.stringify({ idees: [] }), "idees"), /structure invalide/);
  assert.throws(() => parseLlmJson(ideasResultSchema, "pas du json", "idees"), /JSON invalide/);
});

test("fences markdown acceptees", () => {
  const raw = '```json\n{"idees":[{"sujet":"x"}]}\n```';
  const parsed = parseLlmJson(ideasResultSchema, raw, "idees");
  assert.equal(parsed.idees.length, 1);
});

test("script valide : champs requis presents", () => {
  const raw = JSON.stringify({
    titre: "T",
    titre_youtube: "T youtube",
    hook: "H",
    duree: "18s",
    texte_continu: "H. Le corps suit. La preuve. Le payoff.",
    structure: [
      { partie: "hook", texte: "H", duree: "2s" },
      { partie: "corps", texte: "Le corps suit.", duree: "8s" },
      { partie: "preuve", texte: "La preuve.", duree: "5s" },
      { partie: "chute", texte: "Le payoff.", duree: "3s" },
    ],
    fond: "fond",
    description: "desc",
    hashtags: ["a", "b"],
  });
  const parsed = parseLlmJson(scriptResultSchema, raw, "script");
  assert.equal(parsed.structure.length, 4);
  assert.equal(parsed.texte_continu.startsWith("H"), true);
});

test("script sans texte_continu ou structure : rejet", () => {
  const raw = JSON.stringify({ titre: "T", hook: "H" });
  assert.throws(() => parseLlmJson(scriptResultSchema, raw, "script"), /structure invalide/);
});

test("partie de structure inconnue : rejet", () => {
  const raw = JSON.stringify({
    titre: "T",
    hook: "H",
    texte_continu: "x",
    structure: [{ partie: "intro", texte: "x", duree: "2s" }],
  });
  assert.throws(() => parseLlmJson(scriptResultSchema, raw, "script"), /structure invalide/);
});

test("requetes images : tableau de chaines non vides", () => {
  const parsed = parseLlmJson(imageQueriesSchema, JSON.stringify({ queries: ["brain scan", "cold can"] }), "requetes images");
  assert.deepEqual(parsed.queries, ["brain scan", "cold can"]);
  assert.throws(() => parseLlmJson(imageQueriesSchema, JSON.stringify({ queries: [""] }), "requetes images"), /structure invalide/);
});
