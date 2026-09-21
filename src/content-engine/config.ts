// ============================================================
// CONTENT ENGINE - configuration du scoring.
// Tous les poids sont configurables et versionnes. Les valeurs
// par defaut sont un point de depart editorial, PAS une
// probabilite de viralite : le score est un classement relatif
// de criteres explicites.
// ============================================================

import { readFileSync } from "node:fs";

/** Les 13 criteres du contrat (phase 4), tous persistes. */
export const TOPIC_CRITERIA = [
  "demand",
  "curiosity",
  "emotionalImpact",
  "novelty",
  "visualPotential",
  "commentPotential",
  "sharePotential",
  "searchPotential",
  "audienceRelevance",
  "credibility",
  "saturation",
  "banality",
  "followUpPotential",
] as const;
export type TopicCriterion = (typeof TOPIC_CRITERIA)[number];

/** Criteres positifs (les 13 moins saturation/banality, qui sont des penalites). */
export type PositiveCriterion = Exclude<TopicCriterion, "saturation" | "banality">;
export const POSITIVE_CRITERIA: PositiveCriterion[] = TOPIC_CRITERIA.filter(
  (c) => c !== "saturation" && c !== "banality",
) as PositiveCriterion[];

/** Les 8 criteres du hook (phase 8). */
export const HOOK_CRITERIA = [
  "curiosity",
  "clarity",
  "specificity",
  "surprise",
  "emotionalImpact",
  "openLoop",
  "credibility",
  "scrollStoppingPotential",
] as const;
export type HookCriterion = (typeof HOOK_CRITERIA)[number];

/** Penalites boolennes appliquees apres la somme ponderee. */
export const TOPIC_PENALTIES = [
  "tooKnown",
  "lowVisual",
  "tooGeneric",
  "hardToProve",
  "lowCredibility",
] as const;
export type TopicPenalty = (typeof TOPIC_PENALTIES)[number];

export interface TopicScoringConfig {
  /** Version de la formule/poids : incremente quand on change les valeurs. */
  version: number;
  /** Poids des 11 criteres positifs (somme = 1, renormalisee au chargement). */
  weights: Record<PositiveCriterion, number>;
  /** Poids des penalites (banalite/saturation = criteres 0..1, autres = 0/1). */
  penaltyWeights: Record<"banality" | "saturation" | TopicPenalty, number>;
  /** Seuils de rejet automatique (0..1). */
  reject: {
    /** Banalite a partir de laquelle le sujet est rejete. */
    banalityAbove: number;
    /** Saturation a partir de laquelle le sujet est rejete. */
    saturationAbove: number;
    /** Credibilite en dessous de laquelle le sujet est rejete. */
    credibilityBelow: number;
    /** Score total minimum pour etre selectionnable en auto. */
    minTotalScore: number;
  };
}

export interface HookScoringConfig {
  version: number;
  weights: Record<HookCriterion, number>;
  /** Score total minimum pour etre injecte dans le script. */
  minTotalScore: number;
  /** Nombre de variantes generees par candidat (phase 7). */
  variantsPerTopic: number;
}

export const DEFAULT_TOPIC_SCORING: TopicScoringConfig = {
  version: 1,
  weights: {
    demand: 0.12,
    curiosity: 0.14,
    emotionalImpact: 0.08,
    novelty: 0.1,
    visualPotential: 0.08,
    commentPotential: 0.08,
    sharePotential: 0.08,
    searchPotential: 0.06,
    audienceRelevance: 0.12,
    credibility: 0.08,
    followUpPotential: 0.06,
  },
  penaltyWeights: {
    banality: 0.3,
    saturation: 0.15,
    tooKnown: 0.2,
    lowVisual: 0.15,
    tooGeneric: 0.15,
    hardToProve: 0.2,
    lowCredibility: 0.25,
  },
  reject: {
    banalityAbove: 0.8,
    saturationAbove: 0.8,
    credibilityBelow: 0.25,
    minTotalScore: 0.55,
  },
};

export const DEFAULT_HOOK_SCORING: HookScoringConfig = {
  version: 1,
  weights: {
    curiosity: 0.2,
    clarity: 0.18,
    specificity: 0.12,
    surprise: 0.14,
    emotionalImpact: 0.08,
    openLoop: 0.12,
    credibility: 0.08,
    scrollStoppingPotential: 0.08,
  },
  minTotalScore: 0.55,
  variantsPerTopic: 6,
};

/** Controle qu'une config ne perd aucun critere du contrat. */
export function assertTopicScoringConfig(config: TopicScoringConfig): void {
  for (const c of POSITIVE_CRITERIA) {
    if (!Number.isFinite(config.weights[c]) || config.weights[c] < 0) {
      throw new Error(`Poids invalide pour ${c}`);
    }
  }
  for (const p of [...TOPIC_PENALTIES, "banality", "saturation"] as const) {
    if (!Number.isFinite(config.penaltyWeights[p]) || config.penaltyWeights[p] < 0) {
      throw new Error(`Poids de penalite invalide pour ${p}`);
    }
  }
}

// ------------------------------------------------------------
// Configuration globale du moteur (phase 27).
// ------------------------------------------------------------

export interface ContentEngineConfig {
  topicScoring: TopicScoringConfig;
  hookScoring: HookScoringConfig;
  /** Part des choix reserves a l'exploration (0..1, defaut 0.2). */
  explorationRate: number;
  learning: {
    /** Taille d'echantillon minimale avant de tirer une lecon. */
    minSampleSize: number;
    /** Fenetre de recence (jours) des observations prises en compte. */
    recencyWindowDays: number;
  };
  selection: {
    /** Nombre de candidats du haut du classement qui recoivent des hooks. */
    topKCandidates: number;
  };
  factCheck: {
    enabled: boolean;
    /** Nombre maximal de corrections avant rejet explicite. */
    maxCorrections: number;
  };
}

export const DEFAULT_CONTENT_ENGINE_CONFIG: ContentEngineConfig = {
  topicScoring: DEFAULT_TOPIC_SCORING,
  hookScoring: DEFAULT_HOOK_SCORING,
  explorationRate: 0.2,
  learning: { minSampleSize: 5, recencyWindowDays: 90 },
  selection: { topKCandidates: 3 },
  factCheck: { enabled: true, maxCorrections: 1 },
};

/** Surcharge partielle (fichier JSON) : chaque champ est optionnel. */
export interface ContentEngineConfigOverride {
  topicScoring?: {
    version?: number;
    weights?: Partial<Record<PositiveCriterion, number>>;
    penaltyWeights?: Partial<TopicScoringConfig["penaltyWeights"]>;
    reject?: Partial<TopicScoringConfig["reject"]>;
  };
  hookScoring?: {
    version?: number;
    weights?: Partial<Record<HookCriterion, number>>;
    minTotalScore?: number;
    variantsPerTopic?: number;
  };
  explorationRate?: number;
  learning?: Partial<ContentEngineConfig["learning"]>;
  selection?: Partial<ContentEngineConfig["selection"]>;
  factCheck?: Partial<ContentEngineConfig["factCheck"]>;
}

/** Fusion profonde limitée aux champs connus (pas de cles parasites). */
export function mergeContentEngineConfig(base: ContentEngineConfig, override: ContentEngineConfigOverride | null | undefined): ContentEngineConfig {
  if (!override) return base;
  const out: ContentEngineConfig = {
    topicScoring: {
      ...base.topicScoring,
      ...override.topicScoring,
      weights: { ...base.topicScoring.weights, ...override.topicScoring?.weights },
      penaltyWeights: { ...base.topicScoring.penaltyWeights, ...override.topicScoring?.penaltyWeights },
      reject: { ...base.topicScoring.reject, ...override.topicScoring?.reject },
    },
    hookScoring: {
      ...base.hookScoring,
      ...override.hookScoring,
      weights: { ...base.hookScoring.weights, ...override.hookScoring?.weights },
    },
    explorationRate: typeof override.explorationRate === "number" ? override.explorationRate : base.explorationRate,
    learning: { ...base.learning, ...override.learning },
    selection: { ...base.selection, ...override.selection },
    factCheck: { ...base.factCheck, ...override.factCheck },
  };
  assertTopicScoringConfig(out.topicScoring);
  if (out.explorationRate < 0 || out.explorationRate > 1) {
    throw new Error("explorationRate doit etre entre 0 et 1");
  }
  return out;
}

/**
 * Charge la configuration effective : defauts + surcharge JSON si
 * CONTENT_ENGINE_CONFIG pointe vers un fichier. En cas d'erreur de
 * lecture ou de validation, retourne les defauts et le signale (le
 * moteur ne doit pas s'arreter pour une mauvaise surcharge).
 */
export function loadContentEngineConfig(): ContentEngineConfig {
  const file = process.env.CONTENT_ENGINE_CONFIG;
  if (!file) return DEFAULT_CONTENT_ENGINE_CONFIG;
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as ContentEngineConfigOverride;
    return mergeContentEngineConfig(DEFAULT_CONTENT_ENGINE_CONFIG, parsed);
  } catch (e) {
    console.error(`[content] configuration invalide (${file}), defauts utilises:`, e);
    return DEFAULT_CONTENT_ENGINE_CONFIG;
  }
}
