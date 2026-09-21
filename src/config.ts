import "dotenv/config";

export type LlmProviderName = "mock" | "openai" | "multi";

export interface AppConfig {
  llmProvider: LlmProviderName;
  /** Groq principal (qualite) : base/key/modele (vars LLM_* existantes). */
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  /** Modele rapide / volume (Groq 20B par defaut). */
  llmFastModel: string;
  /** Fournisseur secondaire configurable ("" = desactive). */
  llmSecondaryProvider: string;
  /** DeepSeek : secondary / premium / optionnel. */
  deepseekBaseUrl: string;
  deepseekApiKey: string;
  deepseekModel: string;
  /** Gemini : specialiste / second opinion / optionnel. */
  geminiBaseUrl: string;
  geminiApiKey: string;
  geminiModel: string;
  geminiFallbackModel: string;
  geminiEnabled: boolean;
  edgeVoice: string;
  outputDir: string;
  nIdeas: number;
  language: string;
}

function readEnv(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

export function loadConfig(): AppConfig {
  const providerRaw = readEnv("LLM_PROVIDER", "mock").toLowerCase();
  let llmProvider: LlmProviderName = "mock";
  if (providerRaw === "openai") llmProvider = "openai";
  else if (providerRaw === "multi") llmProvider = "multi";

  return {
    llmProvider,
    llmBaseUrl: readEnv("LLM_BASE_URL", "https://api.groq.com/openai/v1"),
    llmApiKey: readEnv("LLM_API_KEY"),
    llmModel: readEnv("LLM_MODEL", "openai/gpt-oss-120b"),
    llmFastModel: readEnv("LLM_FAST_MODEL", "openai/gpt-oss-20b"),
    llmSecondaryProvider: readEnv("LLM_SECONDARY_PROVIDER", "").toLowerCase(),
    deepseekBaseUrl: readEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    deepseekApiKey: readEnv("DEEPSEEK_API_KEY"),
    deepseekModel: readEnv("DEEPSEEK_MODEL", "deepseek-flash"),
    geminiBaseUrl: readEnv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com"),
    geminiApiKey: readEnv("GEMINI_API_KEY"),
    geminiModel: readEnv("GEMINI_MODEL", "gemini-3.8-flash"),
    geminiFallbackModel: readEnv("GEMINI_FALLBACK_MODEL", ""),
    geminiEnabled: readEnv("GEMINI_ENABLED", "false").toLowerCase() === "true",
    edgeVoice: readEnv("EDGE_VOICE", "en-US-AndrewMultilingualNeural"),
    outputDir: readEnv("OUTPUT_DIR", "output"),
    nIdeas: Number(readEnv("N_IDEES", "3")) || 3,
    language: readEnv("LANGUAGE", "en"),
  };
}
