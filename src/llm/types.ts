// ============================================================
// Couche LLM pluggable.
// Tout provider expose la meme interface `complete` et doit
// retourner du JSON strict (le pipeline en depend).
// ============================================================

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

/** Usage du dernier appel reussi (tokens + modele effectif). */
export interface LlmUsage {
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface LlmProvider {
  readonly name: string;
  /** Usage du dernier appel reussi (pour le logging LLM_USAGE). */
  lastUsage?: LlmUsage | null;
  /** Envoie un prompt et retourne la reponse sous forme de chaine brute. */
  complete(messages: LlmMessage[]): Promise<string>;
}
