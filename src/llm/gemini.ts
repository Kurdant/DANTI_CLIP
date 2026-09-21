import type { LlmMessage, LlmProvider } from "./types.js";
import { withRetries, isTransientError, type RetryOptions } from "./retry.js";

// ============================================================
// Provider Gemini (API native generateContent).
// - systemInstruction pour le prompt systeme ;
// - responseMimeType application/json pour les sorties structurees ;
// - grounding Google Search optionnel (fact-check), si le quota le permet ;
// - retries patients (429 : respect de "retry in Xs" ; 503 : plusieurs
//   tentatives longues) ;
// - modele de secours optionnel (ex. gemini-3.7-flash quand 3.8 est
//   sature) : bascule automatique sur erreur transitoire persistante.
// ============================================================

export interface GeminiOptions {
  /** Active Google Search grounding (necessite un compte facture). */
  grounding?: boolean;
  /** Politique de reprise (defaut : 3 tentatives, 500 ms de base). */
  retry?: RetryOptions;
  /** Modele de secours tente si le modele principal echoue (transitoire). */
  fallbackModel?: string;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly models: string[];

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly opts: GeminiOptions = {},
  ) {
    this.models = [model, ...(opts.fallbackModel ? [opts.fallbackModel] : [])];
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    let lastError: unknown;
    for (const m of this.models) {
      try {
        return await withRetries(async () => this.completeOnce(m, messages), this.opts.retry);
      } catch (e) {
        lastError = e;
        if (!isTransientError(e)) throw e;
      }
    }
    throw lastError;
  }

  private async completeOnce(model: string, messages: LlmMessage[]): Promise<string> {
    const systemParts = messages
      .filter((m) => m.role === "system")
      .map((m) => ({ text: m.content }));
    const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content);

    const url = `${this.baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const body: Record<string, unknown> = {
      contents: userTexts.length > 0 ? [{ role: "user", parts: userTexts.map((t) => ({ text: t })) }] : [{ role: "user", parts: [{ text: "" }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    };
    if (systemParts.length > 0) {
      body.systemInstruction = { parts: systemParts };
    }
    if (this.opts.grounding) {
      body.tools = [{ googleSearch: {} }];
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM gemini error ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) {
      throw new Error("Reponse LLM gemini vide ou invalide");
    }
    this.lastUsage = {
      provider: this.name,
      model,
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    };
    return text;
  }

  lastUsage: import("./types.js").LlmUsage | null = null;
}
