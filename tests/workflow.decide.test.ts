import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRegeneration, type RegenerationInput } from "../server/src/routes/workflow.ts";

function base(overrides: Partial<RegenerationInput> = {}): RegenerationInput {
  return {
    mode: "auto",
    selectedIdeaAt: null,
    selectedScriptAt: null,
    selectedVoiceAt: null,
    voiceScriptId: null,
    selectedScriptId: null,
    hasScripts: false,
    hasVoices: false,
    ...overrides,
  };
}

test("projet auto sans script ni voix : tout regenere", () => {
  const d = decideRegeneration(base());
  assert.deepEqual(d, { regenScript: true, regenVoice: true });
});

test("idee plus recente que le script : script ET voix regeneres", () => {
  const d = decideRegeneration(
    base({
      hasScripts: true,
      hasVoices: true,
      selectedIdeaAt: "2026-09-17 12:00:00",
      selectedScriptAt: "2026-09-17 11:00:00",
      selectedVoiceAt: "2026-09-17 11:30:00",
      voiceScriptId: 7,
      selectedScriptId: 7,
    }),
  );
  assert.deepEqual(d, { regenScript: true, regenVoice: true });
});

test("script plus recent que la voix : voix regeneree, script conserve", () => {
  const d = decideRegeneration(
    base({
      hasScripts: true,
      hasVoices: true,
      selectedIdeaAt: "2026-09-17 10:00:00",
      selectedScriptAt: "2026-09-17 11:00:00",
      selectedVoiceAt: "2026-09-17 10:30:00",
      voiceScriptId: 7,
      selectedScriptId: 7,
    }),
  );
  assert.deepEqual(d, { regenScript: false, regenVoice: true });
});

test("voix liee a un autre script : voix regeneree", () => {
  const d = decideRegeneration(
    base({
      hasScripts: true,
      hasVoices: true,
      selectedIdeaAt: "2026-09-17 10:00:00",
      selectedScriptAt: "2026-09-17 11:00:00",
      selectedVoiceAt: "2026-09-17 11:30:00",
      voiceScriptId: 3,
      selectedScriptId: 7,
    }),
  );
  assert.deepEqual(d, { regenScript: false, regenVoice: true });
});

test("tout coherent et recent : rien ne change", () => {
  const d = decideRegeneration(
    base({
      hasScripts: true,
      hasVoices: true,
      selectedIdeaAt: "2026-09-17 10:00:00",
      selectedScriptAt: "2026-09-17 11:00:00",
      selectedVoiceAt: "2026-09-17 11:30:00",
      voiceScriptId: 7,
      selectedScriptId: 7,
    }),
  );
  assert.deepEqual(d, { regenScript: false, regenVoice: false });
});

test("mode manual : jamais de regeneration automatique", () => {
  const d = decideRegeneration(base({ mode: "manual" }));
  assert.deepEqual(d, { regenScript: false, regenVoice: false });
});
