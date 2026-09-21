import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_CONTENT_ENGINE_CONFIG,
  mergeContentEngineConfig,
  loadContentEngineConfig,
} from "../src/content-engine/config.ts";

afterEach(() => {
  delete process.env.CONTENT_ENGINE_CONFIG;
});

test("config par defaut : invariants", () => {
  const c = DEFAULT_CONTENT_ENGINE_CONFIG;
  assert.equal(c.explorationRate, 0.2);
  assert.equal(c.learning.minSampleSize, 5);
  assert.equal(c.topicScoring.version, 1);
  assert.equal(c.hookScoring.variantsPerTopic, 6);
});

test("fusion : surcharge partielle des poids sans perdre les autres criteres", () => {
  const merged = mergeContentEngineConfig(DEFAULT_CONTENT_ENGINE_CONFIG, {
    topicScoring: { weights: { curiosity: 0.2 } },
    explorationRate: 0.3,
  });
  assert.equal(merged.topicScoring.weights.curiosity, 0.2);
  assert.equal(merged.topicScoring.weights.demand, DEFAULT_CONTENT_ENGINE_CONFIG.topicScoring.weights.demand);
  assert.equal(merged.explorationRate, 0.3);
  assert.equal(merged.hookScoring.weights.curiosity, DEFAULT_CONTENT_ENGINE_CONFIG.hookScoring.weights.curiosity);
});

test("fusion : exploration hors bornes rejetee, poids negatif rejete", () => {
  assert.throws(() => mergeContentEngineConfig(DEFAULT_CONTENT_ENGINE_CONFIG, { explorationRate: 1.5 }), /explorationRate/);
  assert.throws(
    () => mergeContentEngineConfig(DEFAULT_CONTENT_ENGINE_CONFIG, { topicScoring: { weights: { demand: -1 } } }),
    /Poids invalide/,
  );
});

test("chargement depuis un fichier valide", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "danti-config-"));
  const file = path.join(dir, "content-engine.json");
  writeFileSync(file, JSON.stringify({ explorationRate: 0.4, learning: { minSampleSize: 8 } }), "utf8");
  process.env.CONTENT_ENGINE_CONFIG = file;
  const c = loadContentEngineConfig();
  assert.equal(c.explorationRate, 0.4);
  assert.equal(c.learning.minSampleSize, 8);
  assert.equal(c.learning.recencyWindowDays, DEFAULT_CONTENT_ENGINE_CONFIG.learning.recencyWindowDays);
});

test("fichier absent ou JSON invalide : defauts, sans crash", () => {
  process.env.CONTENT_ENGINE_CONFIG = "/inexistant/nope.json";
  assert.deepEqual(loadContentEngineConfig(), DEFAULT_CONTENT_ENGINE_CONFIG);

  const dir = mkdtempSync(path.join(tmpdir(), "danti-config-"));
  const file = path.join(dir, "bad.json");
  writeFileSync(file, "pas du json", "utf8");
  process.env.CONTENT_ENGINE_CONFIG = file;
  assert.deepEqual(loadContentEngineConfig(), DEFAULT_CONTENT_ENGINE_CONFIG);
});

test("surcharge invalide (poids manquant) : defauts, sans crash", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "danti-config-"));
  const file = path.join(dir, "bad-weights.json");
  writeFileSync(file, JSON.stringify({ topicScoring: { weights: { demand: "x" } } }), "utf8");
  process.env.CONTENT_ENGINE_CONFIG = file;
  assert.deepEqual(loadContentEngineConfig(), DEFAULT_CONTENT_ENGINE_CONFIG);
});
