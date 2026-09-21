import { z } from "zod";
import type { LlmMessage, LlmProvider } from "../llm/types.js";
import { parseLlmJson } from "../llm/schemas.js";

// ============================================================
// FACT CHECK (phase 11, v1) : avant la generation finale,
// le juge extrait les affirmations critiques du script et les
// qualifie. Une affirmation CONTESTEE presentee comme un fait
// bloque la publication (correction ou rejet explicite).
// Grounding Google Search : active quand le juge le supporte.
// ============================================================

export const FACT_VERDICTS = ["fact", "approximation", "hypothese", "conteste", "non_verifiable"] as const;
export type FactVerdict = (typeof FACT_VERDICTS)[number];

export const factCheckResultSchema = z.object({
  checks: z
    .array(
      z.object({
        claim: z.string().trim().min(1).max(500),
        verdict: z.enum(FACT_VERDICTS),
        reason: z.string().max(500).optional().default(""),
      }),
    )
    .min(1)
    .max(10),
});

export function messagesFactCheck(opts: {
  scriptText: string;
  hook: string;
  language?: string;
}): LlmMessage[] {
  const system = `
You fact-check a short science & curiosity video script before publication.
Extract the 3-6 CRITICAL factual claims (numbers, comparisons, absolutes like
"always/never/only", myths) from the narration below. For each claim, verify it
against well-established knowledge and classify it :
- fact : solid, widely established.
- approximation : roughly right but simplified.
- hypothese : plausible but not proven (must NOT be stated as certain).
- conteste : contradicted by mainstream science, or a known myth.
- non_verifiable : no reliable basis to assert it.

RULES :
- Never mark a claim as "fact" unless you are confident it is established.
- Flag invented statistics and unjustified absolutes.
- If a claim is "conteste" or a myth, say exactly why.
Reply in the language of the user message.

Reply ONLY with valid JSON :
{ "checks": [ { "claim": "...", "verdict": "fact", "reason": "..." } ] }`;
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `Language : ${opts.language ?? "en"}\nHook : ${opts.hook}\nNarration :\n${opts.scriptText}`,
    },
  ];
}

export interface FactCheckReport {
  checks: { claim: string; verdict: FactVerdict; reason: string }[];
  blocking: boolean;
  blockingReasons: string[];
}

/** Un script est bloque si une affirmation contestee y est presentee comme un fait. */
export function assessFactCheck(checks: { claim: string; verdict: FactVerdict; reason: string }[]): FactCheckReport {
  const blocking = checks.filter((c) => c.verdict === "conteste");
  return {
    checks,
    blocking: blocking.length > 0,
    blockingReasons: blocking.map((c) => `${c.claim} (${c.reason || "affirmation contestee"})`),
  };
}

/** Verifie le script via le juge ; leve une erreur si la reponse est invalide. */
export async function factCheckScript(
  judge: LlmProvider,
  scriptText: string,
  hook: string,
  language?: string,
): Promise<FactCheckReport> {
  const raw = await judge.complete(messagesFactCheck({ scriptText, hook, language }));
  const parsed = parseLlmJson(factCheckResultSchema, raw, "fact check");
  return assessFactCheck(parsed.checks);
}
