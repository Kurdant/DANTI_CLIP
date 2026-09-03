// ============================================================
// Couche LLM pluggable.
// Tout provider expose la meme interface `complete` et doit
// retourner du JSON strict (le pipeline en depend).
// ============================================================

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmProvider {
  readonly name: string;
  /** Envoie un prompt et retourne la reponse sous forme de chaine brute. */
  complete(messages: LlmMessage[]): Promise<string>;
}
