import { z } from "zod";
import type { LlmMessage, LlmProvider } from "../llm/types.js";
import { parseLlmJson } from "../llm/schemas.js";

// ============================================================
// SELECTION FINALE par le juge (Gemini) : parmi les candidats
// deja scores et leurs hooks, choisit le gagnant avec une
// justification. Le format est valide par Zod ; le choix est
// trace (persiste ailleurs). Repli deterministe cote workflow.
// ============================================================

export interface FinalCandidateInput {
  index: number; // 1-based
  title: string;
  idea_text: string;
  angle: string;
  total: number;
  banality: number;
  credibility: number;
  hooks: { index: number; text: string; pattern: string | null; total: number }[];
}

export const finalSelectionResultSchema = z.object({
  candidate_index: z.coerce.number().int().min(1).max(50),
  hook_index: z.coerce.number().int().min(1).max(30),
  justification: z.string().max(1000).optional().default(""),
});

export function messagesFinalSelection(opts: {
  candidates: FinalCandidateInput[];
  language?: string;
}): LlmMessage[] {
  const payload = JSON.stringify(opts.candidates, null, 2);
  const system = `
You are the final editor of a short science & curiosity video channel.
Below are ranked topic candidates (already scored on 13 editorial criteria :
demand, curiosity, emotionalImpact, novelty, visualPotential, commentPotential,
sharePotential, searchPotential, audienceRelevance, credibility, saturation,
banality, followUpPotential) and, for each, hook variants (already scored on
curiosity, clarity, specificity, surprise, emotionalImpact, openLoop,
credibility, scrollStoppingPotential).

Choose THE single best (candidate, hook) pair for the next video :
- Prefer strong scores AND an honest, scroll-stopping hook that the video can
  actually deliver. No clickbait.
- Do NOT pick a candidate flagged by high banality, high saturation or low
  credibility, even if its hook looks punchy.
- Reply in the language of the user message.

Reply ONLY with valid JSON :
{ "candidate_index": 2, "hook_index": 3, "justification": "1-2 sentences" }`;
  return [
    { role: "system", content: system },
    { role: "user", content: `Language : ${opts.language ?? "en"}\nCandidates :\n${payload}` },
  ];
}

export interface FinalSelection {
  candidateIndex: number;
  hookIndex: number;
  justification: string;
}

/** Demande la selection finale au juge ; leve une erreur si invalide. */
export async function selectFinalContent(
  judge: LlmProvider,
  candidates: FinalCandidateInput[],
  language?: string,
): Promise<FinalSelection> {
  const raw = await judge.complete(messagesFinalSelection({ candidates, language }));
  const parsed = parseLlmJson(finalSelectionResultSchema, raw, "selection finale");
  return {
    candidateIndex: parsed.candidate_index,
    hookIndex: parsed.hook_index,
    justification: parsed.justification,
  };
}
