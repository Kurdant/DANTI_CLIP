import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, type AppConfig } from "../src/config.ts";
import { createContentLlms, createLlm, createJudgeWithGrounding } from "../src/llm/index.ts";
import { GeminiProvider } from "../src/llm/gemini.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.LLM_PROVIDER;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

function configMulti(): AppConfig {
  process.env.LLM_PROVIDER = "multi";
  process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
  process.env.GEMINI_API_KEY = "gemini-test";
  return loadConfig();
}

test("mode multi : generator = DeepSeek (openai-compatible), judge = Gemini", () => {
  const { generator, judge } = createContentLlms(configMulti());
  assert.equal(generator.name, "openai");
  assert.equal(judge.name, "gemini");
});

test("mode mock : les deux roles utilisent le mock", () => {
  process.env.LLM_PROVIDER = "mock";
  const { generator, judge } = createContentLlms(loadConfig());
  assert.equal(generator.name, "mock");
  assert.equal(judge.name, "mock");
});

test("mode multi sans cle : erreur explicite", () => {
  process.env.LLM_PROVIDER = "multi";
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.throws(() => createContentLlms(loadConfig()), /DEEPSEEK_API_KEY/);
});

test("createJudgeWithGrounding : judge Gemini avec grounding active", () => {
  const judge = createJudgeWithGrounding(configMulti());
  assert.equal(judge.name, "gemini");
  assert.ok(judge instanceof GeminiProvider);
});

test("GeminiProvider : requete bien formee (systemInstruction, JSON, grounding optionnel)", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] }),
    } as unknown as Response;
  }) as typeof fetch;

  const provider = new GeminiProvider("https://generativelanguage.googleapis.com", "key", "gemini-3.8-flash", { grounding: true });
  const out = await provider.complete([
    { role: "system", content: "systeme" },
    { role: "user", content: "question" },
  ]);
  assert.equal(out, "{\"ok\":true}");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("gemini-3.8-flash"));
  assert.deepEqual(calls[0].body.systemInstruction, { parts: [{ text: "systeme" }] });
  assert.deepEqual((calls[0].body.generationConfig as { responseMimeType: string }).responseMimeType, "application/json");
  assert.deepEqual(calls[0].body.tools, [{ googleSearch: {} }]);
});

test("GeminiProvider : sans grounding, pas d'outil", async () => {
  const calls: { body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)) });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }) } as unknown as Response;
  }) as typeof fetch;

  const provider = new GeminiProvider("https://generativelanguage.googleapis.com", "key", "gemini-3.8-flash");
  await provider.complete([{ role: "user", content: "q" }]);
  assert.equal(calls[0].body.tools, undefined);
});

test("GeminiProvider : erreur HTTP -> erreur explicite", async () => {
  globalThis.fetch = (async () => ({
    ok: false,
    status: 429,
    text: async () => "{\"error\":{\"message\":\"quota exceeded\"}}",
  }) as unknown as Response) as typeof fetch;

  const provider = new GeminiProvider("https://generativelanguage.googleapis.com", "key", "gemini-3.8-flash");
  await assert.rejects(() => provider.complete([{ role: "user", content: "q" }]), /LLM gemini error 429/);
});

test("GeminiProvider : reponse vide -> erreur", async () => {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [] } }] }),
  }) as unknown as Response) as typeof fetch;

  const provider = new GeminiProvider("https://generativelanguage.googleapis.com", "key", "gemini-3.8-flash");
  await assert.rejects(() => provider.complete([{ role: "user", content: "q" }]), /vide ou invalide/);
});

test("GeminiProvider : bascule sur le modele de secours si le principal sature (503)", async () => {
  const urls: string[] = [];
  let primaryCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("gemini-3.8-flash")) {
      primaryCalls++;
      return { ok: false, status: 503, text: async () => "{\"error\":\"503\"}" } as unknown as Response;
    }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] }) } as unknown as Response;
  }) as typeof fetch;

  const provider = new GeminiProvider("https://generativelanguage.googleapis.com", "k", "gemini-3.8-flash", {
    fallbackModel: "gemini-3.7-flash",
    retry: { attempts: 1, baseDelayMs: 5 },
  });
  const out = await provider.complete([{ role: "user", content: "q" }]);
  assert.equal(out, "{\"ok\":true}");
  assert.ok(urls.some((u) => u.includes("gemini-3.7-flash")), "le modele de secours doit etre tente");
  assert.ok(primaryCalls >= 1, "le modele principal doit etre tente d'abord");
});
