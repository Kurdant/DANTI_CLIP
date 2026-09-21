// ============================================================
// Retries avec backoff exponentiel pour les appels LLM.
// Les erreurs transitoires (429, 5xx, echecs reseau) ne doivent
// jamais faire basculer tout le scoring en repli heuristique.
// ============================================================

export interface RetryOptions {
  /** Nombre maximal de tentatives (defaut 3). */
  attempts?: number;
  /** Delai de base (ms) avant la premiere reprise (defaut 500). */
  baseDelayMs?: number;
  /** Budget total (ms) de la sequence de reprises (defaut : illimite). */
  maxTotalMs?: number;
}

export function isTransientError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|5\d\d|fetch failed|network|ETIMEDOUT|ECONN|EAI_AGAIN|aborted/i.test(msg);
}

/** Extrait l'indication "retry in Xs" renvoyee par l'API (429 Google/Gemini...). */
export function retryHintMs(e: unknown): number | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/retry in\s+([\d.]+)\s*s/i);
  if (!m) return null;
  const seconds = Number(m[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : null;
}

/** Delai avant la tentative `attempt` (1-based) : backoff exponentiel, jamais sous l'indication API. */
export function computeRetryDelay(e: unknown, attempt: number, baseDelayMs: number): number {
  const backoff = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.max(backoff, retryHintMs(e) ?? 0);
}

/**
 * Execute `fn` avec reprises sur erreurs transitoires. Relance les erreurs
 * non transitoires telles quelles.
 */
export async function withRetries<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const base = Math.max(0, opts.baseDelayMs ?? 500);
  const startedAt = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const retryable = isTransientError(e);
      if (!retryable || attempt === attempts) throw e;
      if (opts.maxTotalMs != null && Date.now() - startedAt >= opts.maxTotalMs) {
        throw e;
      }
      const delay = computeRetryDelay(e, attempt, base);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
