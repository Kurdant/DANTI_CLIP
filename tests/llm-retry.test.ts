import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../src/llm/gemini.ts";
import { OpenAiCompatibleProvider } from "../src/llm/openai.ts";
import { withRetries, isTransientError, retryHintMs, computeRetryDelay } from "../src/llm/retry.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function fetchWith(statuses: number[], finalBody: unknown, onCall?: () => void): typeof fetch {
  let calls = 0;
  return (async () => {
    const idx = calls++;
    onCall?.();
    const status = idx < statuses.length ? statuses[idx] : 200;
    if (status !== 200) {
      return { ok: false, status, text: async () => `{"error":"${status}"}` } as unknown as Response;
    }
    return { ok: true, json: async () => finalBody } as unknown as Response;
  }) as typeof fetch;
}

test("isTransientError : 429, 5xx et reseau sont transitoires, 400 ne l'est pas", () => {
  assert.ok(isTransientError(new Error("LLM gemini error 503")));
  assert.ok(isTransientError(new Error("LLM error 429")));
  assert.ok(isTransientError(new Error("fetch failed")));
  assert.ok(!isTransientError(new Error("LLM error 400")));
  assert.ok(!isTransientError(new Error("Reponse LLM vide")));
});

test("withRetries : reussit apres deux 503, nombre de tentatives correct", async () => {
  let calls = 0;
  const out = await withRetries(async () => {
    calls++;
    if (calls < 3) throw new Error("LLM gemini error 503");
    return "ok";
  }, { baseDelayMs: 5 });
  assert.equal(out, "ok");
  assert.equal(calls, 3);
});

test("withRetries : erreur non transitoire relancee sans reprise", async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetries(async () => {
      calls++;
      throw new Error("LLM error 400: bad request");
    }, { baseDelayMs: 5 }),
    /LLM error 400/,
  );
  assert.equal(calls, 1);
});

test("GeminiProvider : 503 puis succes -> une seule reprise", async () => {
  let calls = 0;
  globalThis.fetch = fetchWith([503], { candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] }, () => calls++);
  const provider = new GeminiProvider("https://generativelanguage.googleapis.com", "k", "gemini-3.8-flash", { retry: { baseDelayMs: 5 } });
  const out = await provider.complete([{ role: "user", content: "q" }]);
  assert.equal(out, "{\"ok\":true}");
  assert.equal(calls, 2);
});

test("GeminiProvider : 503 persistants -> erreur apres les tentatives", async () => {
  let calls = 0;
  globalThis.fetch = fetchWith([503, 503, 503], {}, () => calls++);
  const provider = new GeminiProvider("https://generativelanguage.googleapis.com", "k", "gemini-3.8-flash", { retry: { attempts: 3, baseDelayMs: 5 } });
  await assert.rejects(() => provider.complete([{ role: "user", content: "q" }]), /503/);
  assert.equal(calls, 3);
});

test("OpenAiCompatibleProvider : 429 puis succes", async () => {
  let calls = 0;
  globalThis.fetch = fetchWith([429], { choices: [{ message: { content: "{\"ok\":true}" } }] }, () => calls++);
  const provider = new OpenAiCompatibleProvider("https://api.deepseek.com", "k", "deepseek-flash", { baseDelayMs: 5 });
  const out = await provider.complete([{ role: "user", content: "q" }]);
  assert.equal(out, "{\"ok\":true}");
  assert.equal(calls, 2);
});

test("withRetries : budget total depasse -> echec rapide", async () => {
  let calls = 0;
  const t0 = Date.now();
  await assert.rejects(
    () => withRetries(async () => {
      calls++;
      throw new Error("LLM gemini error 503");
    }, { attempts: 10, baseDelayMs: 500, maxTotalMs: 200 }),
    /503/,
  );
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 1500, `trop lent : ${elapsed}ms`);
  assert.ok(calls < 10, "ne doit pas epuiser les tentatives");
});

test("retryHintMs : extrait l'indication 'retry in Xs' de Google", () => {
  const e = new Error("Quota exceeded ... Please retry in 6.906462586s.");
  assert.equal(retryHintMs(e), 6907);
  assert.equal(retryHintMs(new Error("LLM error 500")), null);
});

test("computeRetryDelay : jamais sous l'indication API, sinon backoff exponentiel", () => {
  const quota = new Error("Please retry in 6.9s");
  assert.equal(computeRetryDelay(quota, 1, 2000), 6900);
  assert.equal(computeRetryDelay(quota, 3, 2000), 8000);
  assert.equal(computeRetryDelay(new Error("503"), 1, 2000), 2000);
  assert.equal(computeRetryDelay(new Error("503"), 3, 2000), 8000);
});
