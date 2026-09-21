import { z } from "zod";
import type { LlmMessage, LlmProvider } from "../llm/types.js";
import { parseLlmJson } from "../llm/schemas.js";

// ============================================================
// CONTENT ENGINE - generation de plusieurs hooks par sujet/angle.
// Etape independante du script : N variantes, puis scoring et
// selection (voir evaluator.ts + scoring.ts scoreHook).
// ============================================================

export const HOOK_PATTERNS = [
  "curiosity_gap",
  "experience",
  "contradiction",
  "question",
  "unexpected_consequence",
  "mystery",
  "specific_phenomenon",
] as const;
export type HookPattern = (typeof HOOK_PATTERNS)[number];

export const hookGenerationResultSchema = z.object({
  hooks: z
    .array(
      z.object({
        hook_text: z.string().trim().min(1).max(200),
        pattern: z.enum(HOOK_PATTERNS).optional(),
      }),
    )
    .min(1)
    .max(30),
});

export function messagesHookGeneration(opts: {
  topic: string;
  angle?: string;
  language?: string;
  count: number;
}): LlmMessage[] {
  const system = `
You write hooks (the FIRST spoken sentence) for short science & curiosity videos.
Write in the language given in the user message. Provide exactly ${opts.count}
DIFFERENT hooks for the topic below, spreading across these patterns :
- curiosity_gap : opens a mental question the video will close.
- experience : something the viewer has probably lived without understanding.
- contradiction : something that looks normal but is not.
- question : a direct, short question.
- unexpected_consequence : a small thing with a big consequence.
- mystery : the brain/body does something unexplained for a few seconds.
- specific_phenomenon : a precise, concrete everyday phenomenon.

RULES :
- One sentence, MAX 12 words, instantly understandable.
- NO "did you know", NO school-style intro, NO generic filler.
- NEVER give the full answer in the hook - the hook must be answered by the video.
- Honest : the hook must match what the video will actually deliver. No clickbait lie.
- Each hook must be different from the others (different pattern or different angle).

Reply ONLY with valid JSON :
{ "hooks": [ { "hook_text": "...", "pattern": "curiosity_gap" } ] }`;
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `Language : ${opts.language ?? "en"}
Topic : ${opts.topic}${opts.angle ? `\nAngle : ${opts.angle}` : ""}`,
    },
  ];
}

export interface HookVariant {
  hook_text: string;
  pattern: HookPattern | null;
}

/** Genere `count` variantes de hook ; leve une erreur si la reponse est invalide. */
export async function generateHooks(
  llm: LlmProvider,
  topic: string,
  opts: { angle?: string; language?: string; count: number },
): Promise<HookVariant[]> {
  const raw = await llm.complete(messagesHookGeneration({ topic, angle: opts.angle, language: opts.language, count: opts.count }));
  const parsed = parseLlmJson(hookGenerationResultSchema, raw, "generation hooks");
  const minimum = Math.min(opts.count, 3);
  if (parsed.hooks.length < minimum) {
    throw new Error(`Reponse LLM generation hooks : ${parsed.hooks.length} variantes au lieu d'au moins ${minimum}`);
  }
  return parsed.hooks.map((h) => ({ hook_text: h.hook_text, pattern: h.pattern ?? null }));
}
