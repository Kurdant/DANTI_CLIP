import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("./", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const name = "tiktok-content-engine";
const sourceHash = "681fd81559ccc2804eb9691cc26cb783f316ef76c0aa5dbf2ce4c8c77803926f";
const read = (file) => readFileSync(path.join(directory, file), "utf8");
const sequence = (length) => Array.from({ length }, (_, index) => index + 1);
const phaseTitles = [
  "ANALYSE COMPLÈTE DU PROJET",
  "CRÉER UNE DOCUMENTATION MARKDOWN",
  "TOPIC DISCOVERY ENGINE",
  "TOPIC SCORING ENGINE",
  "ANTI-BANALITY ENGINE",
  "CONTENT ANGLE ENGINE",
  "HOOK ENGINE",
  "HOOK SCORING",
  "SCRIPT ENGINE",
  "SECONDARY OPEN LOOPS",
  "FACT CHECKING",
  "VISUAL ENGINE",
  "IDENTITÉ VISUELLE",
  "CONTENT FAMILIES",
  "DATABASE",
  "ANALYTICS",
  "RETENTION ANALYSIS",
  "PERFORMANCE ANALYSIS ENGINE",
  "LEARNING SYSTEM",
  "A/B TESTING",
  "COMMENT-DRIVEN CONTENT",
  "CONTENT SERIES",
  "CONTENT POSITIONING",
  "TOPIC EXAMPLES",
  "DASHBOARD",
  "CONTENT PIPELINE",
  "CONFIGURATION",
  "LOGGING",
  "ERROR HANDLING",
  "DUPLICATION / REPETITION",
  "CONTENT DIVERSITY",
  "PRIORITÉ D’IMPLEMENTATION",
  "PRINCIPES D’OPTIMISATION",
  "RÈGLES ÉDITORIALES",
  "OBJECTIF FINAL",
  "CE QUE TU DOIS FAIRE MAINTENANT",
];
const sectionTitles = [
  "Objectif", "Architecture actuelle", "Architecture cible", "Data Flow",
  "Topic Discovery", "Topic Scoring", "Hook Engine", "Script Engine",
  "Fact Checking", "Visual Engine", "Video Engine", "Publishing", "Analytics",
  "Retention Analysis", "Performance Analysis", "Learning System",
  "Experimentation / A-B Testing", "Content Categories", "Database schema",
  "API endpoints", "Background jobs", "Configuration", "Error handling",
  "Logging", "Future improvements", "Implementation roadmap", "Technical decisions",
  "Risks and limitations",
];

test("le prompt correspond à l’empreinte des deux messages originaux de Yan", () => {
  const bytes = readFileSync(path.join(directory, "prompt-original.md"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sourceHash);
  assert.equal(bytes.length, 32939);
  assert.equal(bytes.toString("utf8").split("\n").length - 1, 1529);
});

test("les 36 phases sont présentes, nommées exactement et dans l’ordre", () => {
  const phases = [...read("prompt-original.md").matchAll(/^PHASE (\d+) — (.+)$/gm)];
  assert.deepEqual(phases.map((match) => Number(match[1])), sequence(36));
  assert.deepEqual(phases.map((match) => match[2]), phaseTitles);
});

test("les 28 sections du document de référence restent intégralement prescrites", () => {
  const sections = [...read("prompt-original.md").matchAll(/^## (\d+)\. (.+)$/gm)];
  assert.deepEqual(sections.map((match) => Number(match[1])), sequence(28));
  assert.deepEqual(sections.map((match) => match[2]), sectionTitles);
});

test("les 10 étapes finales et la question de réussite sont préservées", () => {
  const source = read("prompt-original.md");
  const steps = [...source.matchAll(/^Étape (\d+) :$/gm)];
  assert.deepEqual(steps.map((match) => Number(match[1])), sequence(10));
  assert.ok(source.endsWith("« Quel type de vidéo devrais-je produire ensuite, pourquoi, avec quel sujet, quel angle, quel hook, quelle structure et quel style visuel, compte tenu de tout ce que mes vidéos précédentes ont appris ? » \n"));
});

test("la configuration enregistre uniquement le nouvel agent et référence les fichiers canoniques", () => {
  const config = JSON.parse(readFileSync(path.join(root, "opencode.json"), "utf8"));
  assert.equal(config.$schema, "https://opencode.ai/config.json");
  assert.equal(config.default_agent, name);
  assert.deepEqual(Object.keys(config.agent), [name]);
  assert.equal(config.agent[name].mode, "primary");
  assert.equal(config.agent[name].model, undefined);
  assert.equal(config.instructions, undefined);
  assert.equal(config.agent[name].prompt, "{file:./_byan-output/bmb-creations/tiktok-content-engine/activation.md}\n\n{file:./_byan-output/bmb-creations/tiktok-content-engine/prompt-original.md}");
});

test("le registre suit les 36 phases sans les annoncer implémentées", () => {
  const coverage = read("couverture.md");
  const rows = [...coverage.matchAll(/^\| (\d+) \|/gm)];
  assert.deepEqual(rows.map((match) => Number(match[1])), sequence(36));
  assert.ok(coverage.includes("Non implémenté par cette installation"));
});

test("opencode charge réellement l’agent principal avec tout le texte original", () => {
  const output = execFileSync("opencode", ["debug", "config"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 90_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const config = JSON.parse(output);
  const agent = config.agent[name];
  assert.equal(config.default_agent, name);
  assert.equal(agent.mode, "primary");
  assert.notEqual(agent.hidden, true);
  assert.notEqual(agent.disable, true);
  const source = read("prompt-original.md").trimEnd();
  const activation = read("activation.md").trimEnd();
  const loaded = agent.prompt.trimEnd();
  assert.ok(loaded.endsWith(source), "Le texte original doit être intégralement chargé, sans omission interne.");
  assert.equal(loaded.slice(0, -source.length).trimEnd(), activation);
  assert.equal(config.agent.byan.mode, "primary");
  assert.equal(config.agent["croissance-shorts"].mode, "subagent");
});
