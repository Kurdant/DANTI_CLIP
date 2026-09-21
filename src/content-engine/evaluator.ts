import { z } from "zod";
import type { LlmMessage, LlmProvider } from "../llm/types.js";
import { parseLlmJson } from "../llm/schemas.js";
import type { TopicEvaluation, TopicScores, HookScores } from "./scoring.js";

// ============================================================
// CONTENT ENGINE - evaluation par le LLM des candidats et des
// hooks. Une seule reponse LLM evalue tout le lot (coup minimal).
// Le format est valide par Zod : une reponse invalide echoue ici.
// ============================================================

/** Familles de contenu (phase 14) : liste fermee partagee avec le seed SQL. */
export const CATEGORY_SLUGS = [
  "body",
  "psychology",
  "animals",
  "space",
  "everyday_science",
  "tech",
  "weird_history",
  "dangerous_science",
  "human_behavior",
  "nature",
] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

const score0to1 = z.coerce.number().min(0).max(1);

export const topicScoresSchema = z.object({
  demand: score0to1,
  curiosity: score0to1,
  emotionalImpact: score0to1,
  novelty: score0to1,
  visualPotential: score0to1,
  commentPotential: score0to1,
  sharePotential: score0to1,
  searchPotential: score0to1,
  audienceRelevance: score0to1,
  credibility: score0to1,
  saturation: score0to1,
  banality: score0to1,
  followUpPotential: score0to1,
});

export const topicPenaltiesSchema = z.object({
  tooKnown: score0to1,
  lowVisual: score0to1,
  tooGeneric: score0to1,
  hardToProve: score0to1,
  lowCredibility: score0to1,
});

export const topicEvaluationsResultSchema = z.object({
  evaluations: z
    .array(
      z.object({
        scores: topicScoresSchema,
        penalties: topicPenaltiesSchema,
        categories: z.array(z.enum(CATEGORY_SLUGS)).max(3).optional().default([]),
        justification: z.string().max(1000).optional().default(""),
      }),
    )
    .min(1)
    .max(50),
});

export const hookScoresSchema = z.object({
  curiosity: score0to1,
  clarity: score0to1,
  specificity: score0to1,
  surprise: score0to1,
  emotionalImpact: score0to1,
  openLoop: score0to1,
  credibility: score0to1,
  scrollStoppingPotential: score0to1,
});

export const hookEvaluationsResultSchema = z.object({
  evaluations: z
    .array(
      z.object({
        scores: hookScoresSchema,
        justification: z.string().max(1000).optional().default(""),
      }),
    )
    .min(1)
    .max(50),
});

export function messagesTopicEvaluation(opts: { candidates: string[]; language?: string }): LlmMessage[] {
  const numbered = opts.candidates.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const system = `
You evaluate short-video topic candidates for a science & curiosity account.
Rate each criterion from 0 (low) to 1 (high). Rate the candidates as they are
written, in the language of the user message.

- demand : existing audience interest for this exact subject.
- curiosity : urge to know the answer.
- emotionalImpact : emotional charge (awe, surprise, unease).
- novelty : how little-known the angle is.
- visualPotential : can it be SHOWN on screen (objects, scenes, animations) ?
- commentPotential : does it spark questions, debates or personal examples ?
- sharePotential : would someone send it to a friend ?
- searchPotential : would people type this in a search bar ?
- audienceRelevance : fit with a broad curiosity/science audience.
- credibility : solid and verifiable, not a myth or a shaky claim.
- saturation : how over-covered this EXACT fact already is (0 = fresh, 1 = everywhere).
- banality : how generic/obvious it is (0 = sharp second-level angle, 1 = "everyone knows", one-sentence fact).
- followUpPotential : room for sequels or related angles.

Penalties (0 = no, 1 = yes) :
- tooKnown : an overused classic fact.
- lowVisual : hard to illustrate meaningfully.
- tooGeneric : no specific, concrete claim.
- hardToProve : the claim cannot be demonstrated in a short video.
- lowCredibility : sources would be weak or contested.

Categories : classify the candidate into 1 to 3 of these content families
(only from this list) : body, psychology, animals, space, everyday_science,
tech, weird_history, dangerous_science, human_behavior, nature.

Reply ONLY with valid JSON :
{ "evaluations": [ { "scores": { "demand": 0.8, ... }, "penalties": { "tooKnown": 0, ... }, "categories": ["body"], "justification": "1 sentence" } ] }
One evaluation per candidate, in the same order.`;
  return [
    { role: "system", content: system },
    { role: "user", content: `Language : ${opts.language ?? "en"}\nCandidates :\n${numbered}` },
  ];
}

export interface EvaluatedTopic extends TopicEvaluation {
  /** Familles de contenu (phase 14) ; absentes en repli heuristique. */
  categories?: CategorySlug[];
}

/** Evalue un lot de candidats ; leve une erreur si la reponse est invalide. */
export async function evaluateTopics(
  llm: LlmProvider,
  candidates: string[],
  language?: string,
): Promise<EvaluatedTopic[]> {
  const raw = await llm.complete(messagesTopicEvaluation({ candidates, language }));
  const parsed = parseLlmJson(topicEvaluationsResultSchema, raw, "evaluation candidats");
  if (parsed.evaluations.length !== candidates.length) {
    throw new Error(
      `Reponse LLM evaluation candidats : ${parsed.evaluations.length} evaluations pour ${candidates.length} candidats`,
    );
  }
  return parsed.evaluations.map((e) => ({
    scores: e.scores as TopicScores,
    penalties: e.penalties,
    categories: e.categories,
    justification: e.justification,
  }));
}

export function messagesHookEvaluation(opts: { hooks: string[]; language?: string }): LlmMessage[] {
  const numbered = opts.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n");
  const system = `
You evaluate hooks (first spoken sentence) for short science & curiosity videos.
Rate each criterion from 0 (low) to 1 (high).

- curiosity : makes the viewer need the answer.
- clarity : instantly understandable, no jargon.
- specificity : concrete, not generic fluff.
- surprise : contradicts an expectation.
- emotionalImpact : emotional charge.
- openLoop : opens a question resolved LATER, without giving the answer away.
- credibility : honest, deliverable by the video (no clickbait lie).
- scrollStoppingPotential : would stop someone scrolling.

Reply ONLY with valid JSON :
{ "evaluations": [ { "scores": { "curiosity": 0.9, ... }, "justification": "1 sentence" } ] }
One evaluation per hook, in the same order.`;
  return [
    { role: "system", content: system },
    { role: "user", content: `Language : ${opts.language ?? "en"}\nHooks :\n${numbered}` },
  ];
}

/** Evalue un lot de hooks ; leve une erreur si la reponse est invalide. */
export async function evaluateHooks(
  llm: LlmProvider,
  hooks: string[],
  language?: string,
): Promise<{ scores: HookScores; justification: string }[]> {
  const raw = await llm.complete(messagesHookEvaluation({ hooks, language }));
  const parsed = parseLlmJson(hookEvaluationsResultSchema, raw, "evaluation hooks");
  if (parsed.evaluations.length !== hooks.length) {
    throw new Error(
      `Reponse LLM evaluation hooks : ${parsed.evaluations.length} evaluations pour ${hooks.length} hooks`,
    );
  }
  return parsed.evaluations.map((e) => ({ scores: e.scores, justification: e.justification }));
}
