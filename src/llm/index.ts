import type { AppConfig } from "../config.js";
import { MockProvider } from "./mock.js";
import { OpenAiCompatibleProvider } from "./openai.js";
import type { LlmProvider } from "./types.js";

export function createLlm(config: AppConfig): LlmProvider {
  if (config.llmProvider === "openai") {
    if (!config.llmApiKey) {
      throw new Error(
        "LLM_PROVIDER=openai mais LLM_API_KEY est vide. " +
          "Renseigne ta cle (Groq gratuit sur console.groq.com) ou repasse en LLM_PROVIDER=mock.",
      );
    }
    return new OpenAiCompatibleProvider(
      config.llmBaseUrl,
      config.llmApiKey,
      config.llmModel,
    );
  }
  return new MockProvider();
}

export type { LlmProvider, LlmMessage } from "./types.js";
export { extractJson } from "./openai.js";
