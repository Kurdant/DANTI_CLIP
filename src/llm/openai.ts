import type { LlmMessage, LlmProvider } from "./types.js";
import { withRetries, type RetryOptions } from "./retry.js";

/**
 * Provider compatible OpenAI (Groq, DeepSeek, OpenRouter, ...).
 * Utilise le `fetch` natif (Node 20+), aucune dependance SDK.
 * La reponse est parsée de facon robuste (fences JSON acceptees).
 * Retries avec backoff sur les erreurs transitoires (429/5xx/reseau).
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly retryOpts: RetryOptions = {},
  ) {}

  async complete(messages: LlmMessage[]): Promise<string> {
    return withRetries(async () => this.completeOnce(messages), this.retryOpts);
  }

  private async completeOnce(messages: LlmMessage[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.9,
        // Force une sortie JSON (supported par Groq / gpt-oss) pour garantir
        // un parse fiable du script / des idees malgre le modele reasoning.
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Reponse LLM vide ou invalide");
    }

    this.lastUsage = {
      provider: this.name,
      model: this.model,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
    };

    return content;
  }

  lastUsage: import("./types.js").LlmUsage | null = null;
}

/** Extrait le premier objet JSON valide d'une reponse (gere les fences ```json). */
export function extractJson<T = unknown>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (match ? match[1] : raw).trim();
  // Chaise de secours : prend le premier { ... } si assertion d'objet autour.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const slice = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(slice) as T;
}
