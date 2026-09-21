import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setContentLogSink, resetContentLogSink, logContentEvent, type ContentEventName } from "../src/content-engine/logging.ts";

const EVENTS: ContentEventName[] = [
  "TOPIC_DISCOVERED", "TOPIC_REJECTED", "TOPIC_SELECTED", "HOOK_GENERATED",
  "HOOK_REJECTED", "SCRIPT_GENERATED", "FACT_CHECK_FAILED", "VIDEO_GENERATED",
  "VIDEO_PUBLISHED", "ANALYTICS_UPDATED", "PERFORMANCE_ANALYZED",
  "LEARNING_UPDATED", "EXPERIMENT_STARTED", "EXPERIMENT_COMPLETED",
];

afterEach(() => resetContentLogSink());

test("tous les evenements du contrat sont supportes", () => {
  const lines: string[] = [];
  setContentLogSink((l) => lines.push(l));
  for (const e of EVENTS) logContentEvent(e, { userId: 1 });
  assert.equal(lines.length, EVENTS.length);
  for (const [i, line] of lines.entries()) {
    const parsed = JSON.parse(line);
    assert.equal(parsed.event, EVENTS[i]);
    assert.ok(parsed.ts, "horodatage absent");
  }
});

test("les champs sont preserves et aucun secret n'est attendu", () => {
  const lines: string[] = [];
  setContentLogSink((l) => lines.push(l));
  logContentEvent("TOPIC_REJECTED", { userId: 7, topicCandidateId: 12, data: { reasons: ["banality=0.90"] } });
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.userId, 7);
  assert.equal(parsed.topicCandidateId, 12);
  assert.deepEqual(parsed.data.reasons, ["banality=0.90"]);
  assert.ok(!("apiKey" in parsed));
});
