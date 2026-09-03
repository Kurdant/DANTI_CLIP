import "dotenv/config";

export type LlmProviderName = "mock" | "openai";

export interface AppConfig {
  llmProvider: LlmProviderName;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
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
  const llmProvider: LlmProviderName =
    providerRaw === "openai" ? "openai" : "mock";

  return {
    llmProvider,
    llmBaseUrl: readEnv("LLM_BASE_URL", "https://api.groq.com/openai/v1"),
    llmApiKey: readEnv("LLM_API_KEY"),
    llmModel: readEnv("LLM_MODEL", "llama-3.3-70b-versatile"),
    edgeVoice: readEnv("EDGE_VOICE", "fr-FR-HenriNeural"),
    outputDir: readEnv("OUTPUT_DIR", "output"),
    nIdeas: Number(readEnv("N_IDEES", "3")) || 3,
    language: readEnv("LANGUAGE", "fr"),
  };
}
