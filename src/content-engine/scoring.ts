import type {
  TopicScoringConfig,
  TopicCriterion,
  HookScoringConfig,
  HookCriterion,
  TopicPenalty,
} from "./config.js";
import { POSITIVE_CRITERIA, TOPIC_PENALTIES } from "./config.js";

// ============================================================
// CONTENT ENGINE - calcul pur des scores (aucun reseau, aucune
// base) : testable, versionnable, rejouable.
// ============================================================

/** Sous-scores d'un candidat (0..1 chacun). */
export type TopicScores = Record<TopicCriterion, number>;

/** Evaluation complete d'un candidat, telle que persistee. */
export interface TopicEvaluation {
  scores: TopicScores;
  /** Drapeaux de penalite (0/1) : trop connu, trop generique, etc. */
  penalties: Record<TopicPenalty, number>;
  /** Justification texte de l'evaluateur (auditabilite). */
  justification: string;
}

export interface TopicScoreResult {
  /** Somme ponderee des 11 criteres positifs (0..1). */
  positive: number;
  /** Total des penalites soustraites (0..1). */
  penalties: number;
  /** Score final borne 0..1. */
  total: number;
  /** Le candidat doit-il etre rejete automatiquement ? */
  rejected: boolean;
  /** Raisons du rejet (vide si accepte). */
  reasons: string[];
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Calcule le score d'un candidat :
 *   total = Σ(critere_positif_i × poids_i) − penalites
 * Les poids positifs sont renormalises (somme 1). Saturation et banalite
 * sont des penalites (contrat phase 4), pas des criteres recompenses.
 */
export function scoreTopic(evaluation: TopicEvaluation, config: TopicScoringConfig): TopicScoreResult {
  const weightSum = POSITIVE_CRITERIA.reduce((acc, c) => acc + config.weights[c], 0);
  if (weightSum <= 0) throw new Error("Somme des poids positifs nulle");

  let positive = 0;
  for (const c of POSITIVE_CRITERIA) {
    positive += clamp01(evaluation.scores[c]) * (config.weights[c] / weightSum);
  }
  positive = clamp01(positive);

  let penalties = 0;
  penalties += clamp01(evaluation.scores.banality) * config.penaltyWeights.banality;
  penalties += clamp01(evaluation.scores.saturation) * config.penaltyWeights.saturation;
  for (const p of TOPIC_PENALTIES) {
    penalties += clamp01(evaluation.penalties[p]) * config.penaltyWeights[p];
  }
  penalties = clamp01(penalties);

  const total = clamp01(positive - penalties);

  const reasons: string[] = [];
  if (evaluation.scores.banality >= config.reject.banalityAbove) {
    reasons.push(`banality=${evaluation.scores.banality.toFixed(2)} (seuil ${config.reject.banalityAbove})`);
  }
  if (evaluation.scores.saturation >= config.reject.saturationAbove) {
    reasons.push(`saturation=${evaluation.scores.saturation.toFixed(2)} (seuil ${config.reject.saturationAbove})`);
  }
  if (evaluation.scores.credibility < config.reject.credibilityBelow) {
    reasons.push(`credibility=${evaluation.scores.credibility.toFixed(2)} (seuil ${config.reject.credibilityBelow})`);
  }
  if (total < config.reject.minTotalScore) {
    reasons.push(`total=${total.toFixed(2)} (seuil ${config.reject.minTotalScore})`);
  }

  return { positive, penalties, total, rejected: reasons.length > 0, reasons };
}

/** Sous-scores d'un hook (0..1 chacun). */
export type HookScores = Record<HookCriterion, number>;

export function scoreHook(scores: HookScores, config: HookScoringConfig): number {
  const weightSum = Object.keys(config.weights).reduce(
    (acc, k) => acc + config.weights[k as HookCriterion],
    0,
  );
  if (weightSum <= 0) throw new Error("Somme des poids du hook nulle");
  let total = 0;
  for (const k of Object.keys(config.weights) as HookCriterion[]) {
    total += clamp01(scores[k]) * (config.weights[k] / weightSum);
  }
  return clamp01(total);
}
