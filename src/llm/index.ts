import type { AppConfig } from "../config.js";
import { MockProvider } from "./mock.js";
import { OpenAiCompatibleProvider } from "./openai.js";
import { GeminiProvider } from "./gemini.js";
import { isTransientError } from "./retry.js";
import type { LlmProvider, LlmUsage } from "./types.js";

// ============================================================
// Strategie LLM (validee 18/09/2026) :
//   GROQ = DEFAULT (20B rapide/volume, 120B qualite)
//   DEEPSEEK = SECONDARY / OPTIONNEL (LLM_SECONDARY_PROVIDER=deepseek)
//   GEMINI = SPECIALIST / SECOND OPINION / OPTIONNEL (GEMINI_ENABLED)
// Hierarchies de fallback (jamais de faux resultat) :
//   rapide : 20B -> 120B -> DeepSeek -> DEFERRED/NEEDS_REVIEW (throw)
//   qualite : 120B -> 20B -> DeepSeek -> Gemini (si active) -> throw
// ============================================================

export function createOpenAiProvider(baseUrl: string, apiKey: string, model: string): LlmProvider {
  if (!apiKey) {
    throw new Error("Cle API manquante pour le provider openai-compatible (LLM_API_KEY ou DEEPSEEK_API_KEY)");
  }
  return new OpenAiCompatibleProvider(baseUrl, apiKey, model);
}

export function createGeminiProvider(baseUrl: string, apiKey: string, model: string, opts?: { grounding?: boolean; fallbackModel?: string }): LlmProvider {
  if (!apiKey) {
    throw new Error("Cle API manquante pour Gemini (GEMINI_API_KEY)");
  }
  return new GeminiProvider(baseUrl, apiKey, model, {
    grounding: opts?.grounding ?? false,
    fallbackModel: opts?.fallbackModel || undefined,
    retry: { attempts: 3, baseDelayMs: 2000, maxTotalMs: 45_000 },
  });
}

/** Fournisseur unique (compatibilite historique + CLI). */
export function createLlm(config: AppConfig): LlmProvider {
  if (config.llmProvider === "openai") {
    return createOpenAiProvider(config.llmBaseUrl, config.llmApiKey, config.llmModel);
  }
  return new MockProvider();
}

/**
 * Chaine de secours : essaie chaque provider dans l'ordre ; bascule au
 * suivant sur erreur transitoire (quota, saturation, reseau). Une erreur
 * non transitoire est relancee telle quelle. Expose l'usage du provider
 * qui a servi (pour le logging LLM_USAGE).
 */
export class FallbackChainProvider implements LlmProvider {
  readonly name: string;
  lastUsage: LlmUsage | null = null;

  constructor(private readonly providers: LlmProvider[]) {
    this.name = `chain(${providers.map((p) => p.name).join("|")})`;
  }

  async complete(messages: { role: "system" | "user"; content: string }[]): Promise<string> {
    let lastError: unknown;
    for (const p of this.providers) {
      try {
        const out = await p.complete(messages);
        this.lastUsage = p.lastUsage ?? { provider: p.name, model: null, inputTokens: null, outputTokens: null };
        return out;
      } catch (e) {
        lastError = e;
        if (!isTransientError(e)) throw e;
      }
    }
    throw lastError;
  }
}

export interface ContentLlmRoles {
  /** Taches rapides / massives (idees, hooks, images). */
  fast: LlmProvider;
  /** Taches qualite (script final, fact-check, analyses). */
  quality: LlmProvider;
  /** Gemini en second opinion (optionnel, GEMINI_ENABLED). */
  gemini?: LlmProvider;
}

export function createContentLlms(config: AppConfig): ContentLlmRoles {
  if (config.llmProvider === "mock") {
    const mock = new MockProvider();
    return { fast: mock, quality: mock };
  }

  const groqFast = createOpenAiProvider(config.llmBaseUrl, config.llmApiKey, config.llmFastModel);
  const groqQuality = createOpenAiProvider(config.llmBaseUrl, config.llmApiKey, config.llmModel);
  const groqFastQuality = new FallbackChainProvider([groqFast, groqQuality]);
  const groqQualityFast = new FallbackChainProvider([groqQuality, groqFast]);

  const chain: LlmProvider[] = [];
  if (config.llmSecondaryProvider === "deepseek" && config.deepseekApiKey) {
    chain.push(createOpenAiProvider(config.deepseekBaseUrl, config.deepseekApiKey, config.deepseekModel));
  }
  if (config.geminiEnabled && config.geminiApiKey) {
    chain.push(createGeminiProvider(config.geminiBaseUrl, config.geminiApiKey, config.geminiModel, { fallbackModel: config.geminiFallbackModel || undefined }));
  }

  const fast = new FallbackChainProvider([groqFastQuality, ...chain]);
  const quality = new FallbackChainProvider([groqQualityFast, ...chain]);
  const gemini = config.geminiEnabled && config.geminiApiKey
    ? createGeminiProvider(config.geminiBaseUrl, config.geminiApiKey, config.geminiModel, { fallbackModel: config.geminiFallbackModel || undefined })
    : undefined;

  return { fast, quality, gemini };
}

/** Judge avec grounding (fact-check second opinion) : Gemini si disponible. */
export function createJudgeWithGrounding(config: AppConfig): LlmProvider | null {
  if (config.geminiEnabled && config.geminiApiKey) {
    return createGeminiProvider(config.geminiBaseUrl, config.geminiApiKey, config.geminiModel, {
      grounding: true,
      fallbackModel: config.geminiFallbackModel || undefined,
    });
  }
  return null;
}

export type { LlmProvider, LlmMessage, LlmUsage } from "./types.js";
export { extractJson } from "./openai.js";
