import type { ServerEnv } from "./env.js";
import { dbQuery } from "../auth/middleware.js";

// ============================================================
// QUOTA TTS MENSUEL (garde-fou anti-facturation).
// Google Cloud TTS ne bloque pas a la limite du free tier :
// au-dela, c'est pay-as-you-go. On compte donc nous-memes les
// caracteres synthetises et on BLOQUE avant d'atteindre le
// plafond gratuit. ZERO facturation surprise.
// ============================================================

/** Plafond par defaut : 90% du free tier Google TTS (1 M caracteres/mois). */
const DEFAULT_LIMIT = 900_000;

function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Caracteres TTS deja consommes ce mois. */
export function ttsCharsUsed(env: ServerEnv): number {
  const row = dbQuery(env, "SELECT chars FROM tts_usage WHERE month = ?", [monthKey()]).get() as
    | { chars: number }
    | undefined;
  return row ? Number(row.chars) : 0;
}

/** Caracteres encore disponibles ce mois (>= 0). */
export function ttsRemainingChars(env: ServerEnv): number {
  const limit = Number(process.env.TTS_MONTHLY_LIMIT || DEFAULT_LIMIT);
  return Math.max(0, limit - ttsCharsUsed(env));
}

/** Enregistre une consommation (apres une synthese reussie). */
export function ttsRecordChars(env: ServerEnv, n: number): void {
  dbQuery(
    env,
    "INSERT INTO tts_usage (month, chars) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET chars = chars + excluded.chars",
    [monthKey(), Math.max(0, Math.round(n))],
  ).run();
}