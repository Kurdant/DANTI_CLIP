// ============================================================
// CONTENT ENGINE - learning : agregation prudente des resultats
// reels et recommandation traçable du prochain contenu.
// Regles : taille d'echantillon minimale, mediane + moyenne,
// fenetre de recence, niveau de confiance, exploration.
// Aucune causalite proclamee : ce sont des hypotheses mesurees.
// ============================================================

export interface VideoObservation {
  videoId: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  capturedAt: string | null;
  /** Dimensions du contenu (optionnelles si non liees). */
  category?: string | null;
  hookPattern?: string | null;
  durationSec?: number | null;
}

export interface DimensionStats {
  value: string;
  sampleSize: number;
  medianViews: number | null;
  meanViews: number | null;
  meanLikeRate: number | null;
  meanCommentRate: number | null;
  /** 0..1 : mini(1, echantillon / taille minimale). */
  confidence: number;
  /** Score relatif combinant resultats et confiance (tri decroissant). */
  score: number;
}

export interface Recommendation {
  mode: "exploit" | "explore";
  category: string | null;
  hookPattern: string | null;
  durationRange: string | null;
  reasons: string[];
  confidence: number | null;
  basedOnSampleSize: number;
  explorationRate: number;
}

export function durationBucket(durationSec: number | null | undefined): string | null {
  if (durationSec == null || !Number.isFinite(durationSec)) return null;
  if (durationSec < 15) return "0-15s";
  if (durationSec < 30) return "15-30s";
  if (durationSec < 45) return "30-45s";
  return "45s+";
}

/** Filtre les observations trop anciennes (fenetre de recence en jours). */
export function withinRecency(obs: VideoObservation[], days: number): VideoObservation[] {
  const limit = Date.now() - days * 24 * 3600 * 1000;
  return obs.filter((o) => {
    if (!o.capturedAt) return true; // pas de date : inclus (conservateur)
    const t = Date.parse(o.capturedAt);
    return Number.isFinite(t) ? t >= limit : true;
  });
}

function median(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 === 0 ? (finite[mid - 1] + finite[mid]) / 2 : finite[mid];
}

function mean(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/** Agrege les observations par valeur d'une dimension. */
export function aggregateByDimension(
  observations: VideoObservation[],
  pick: (o: VideoObservation) => string | null | undefined,
  minSampleSize: number,
): DimensionStats[] {
  const groups = new Map<string, VideoObservation[]>();
  for (const o of observations) {
    const value = pick(o);
    if (value == null || value === "") continue;
    const list = groups.get(value) ?? [];
    list.push(o);
    groups.set(value, list);
  }
  const stats: DimensionStats[] = [];
  for (const [value, list] of groups) {
    const views = list.map((o) => o.views).filter((v): v is number => v != null);
    const likeRates = list
      .map((o) => (o.views != null && o.views > 0 && o.likes != null ? o.likes / o.views : null))
      .filter((v): v is number => v != null);
    const commentRates = list
      .map((o) => (o.views != null && o.views > 0 && o.comments != null ? o.comments / o.views : null))
      .filter((v): v is number => v != null);
    // Videos uniques : une video multi-categories ne compte qu'une fois par
    // dimension (sinon le multi-categorisation contournerait minSampleSize).
    const uniqueVideos = new Set(list.map((o) => o.videoId)).size;
    const confidence = Math.min(1, uniqueVideos / Math.max(1, minSampleSize));
    const medianViews = median(views);
    const meanViews = mean(views);
    const meanLikeRate = mean(likeRates);
    const meanCommentRate = mean(commentRates);
    // Score relatif : resultats ponderes par la confiance. log1p pour ne pas
    // laisser quelques vues extremes ecraser l'engagement.
    const score =
      confidence *
      (Math.log1p(medianViews ?? 0) * 2 + (meanLikeRate ?? 0) * 50 + (meanCommentRate ?? 0) * 25);
    stats.push({ value, sampleSize: uniqueVideos, medianViews, meanViews, meanLikeRate, meanCommentRate, confidence, score });
  }
  return stats.sort((a, b) => b.score - a.score);
}

/** Tirage d'exploration (taux configurable) : deterministe avec un random injecte. */
export function shouldExplore(explorationRate: number, random: () => number = Math.random): boolean {
  return random() < explorationRate;
}

/**
 * Construit la recommandation du prochain contenu a partir des observations.
 * - sans echantillon suffisant : exploration explicable ;
 * - sinon : exploitation du meilleur pattern mesure, sauf tirage d'exploration.
 */
export function buildRecommendation(
  byCategory: DimensionStats[],
  byHookPattern: DimensionStats[],
  byDuration: DimensionStats[],
  opts: { explorationRate: number; minSampleSize: number; random?: () => number },
): Recommendation {
  const enough = (s: DimensionStats[]) => s.some((x) => x.sampleSize >= opts.minSampleSize);
  const hasData = enough(byCategory) || enough(byHookPattern) || enough(byDuration);

  if (!hasData) {
    const leastExplored = [...byCategory, ...byHookPattern, ...byDuration]
      .sort((a, b) => a.sampleSize - b.sampleSize)[0];
    const leastByDim = (stats: DimensionStats[]): string | null => {
      if (stats.length === 0) return null;
      return [...stats].sort((a, b) => a.sampleSize - b.sampleSize)[0].value;
    };
    return {
      mode: "explore",
      category: leastByDim(byCategory),
      hookPattern: leastByDim(byHookPattern),
      durationRange: leastByDim(byDuration),
      reasons: [
        `echantillon insuffisant (minimum ${opts.minSampleSize} observations par dimension)`,
        leastExplored
          ? `dimension la moins exploree a tester : ${leastExplored.value} (${leastExplored.sampleSize} obs)`
          : "aucune observation : premier contenu exploratoire",
      ],
      confidence: null,
      basedOnSampleSize: 0,
      explorationRate: opts.explorationRate,
    };
  }

  if (shouldExplore(opts.explorationRate, opts.random)) {
    const leastByDim = (stats: DimensionStats[]): string | null => {
      if (stats.length === 0) return null;
      return [...stats].sort((a, b) => a.sampleSize - b.sampleSize)[0].value;
    };
    return {
      mode: "explore",
      category: leastByDim(byCategory),
      hookPattern: leastByDim(byHookPattern),
      durationRange: leastByDim(byDuration),
      reasons: [
        "tirage d'exploration (eviter l'enfermement dans les succes passes)",
        `taux configure : ${opts.explorationRate}`,
      ],
      confidence: null,
      basedOnSampleSize: Math.max(...[byCategory, byHookPattern, byDuration].map((s) => s[0]?.sampleSize ?? 0)),
      explorationRate: opts.explorationRate,
    };
  }

  const bestCategory = byCategory[0] ?? null;
  const bestHook = byHookPattern[0] ?? null;
  const bestDuration = byDuration[0] ?? null;
  const reasons: string[] = [];
  if (bestCategory) {
    reasons.push(
      `categorie ${bestCategory.value} : mediane ${bestCategory.medianViews?.toFixed(0)} vues sur ${bestCategory.sampleSize} observations (confiance ${bestCategory.confidence.toFixed(2)})`,
    );
  }
  if (bestHook) {
    reasons.push(`pattern de hook ${bestHook.value} : ${bestHook.sampleSize} observations`);
  }
  if (bestDuration) {
    reasons.push(`duree ${bestDuration.value} : ${bestDuration.sampleSize} observations`);
  }
  return {
    mode: "exploit",
    category: bestCategory?.value ?? null,
    hookPattern: bestHook?.value ?? null,
    durationRange: bestDuration?.value ?? null,
    reasons,
    confidence: Math.min(bestCategory?.confidence ?? 1, bestHook?.confidence ?? 1, bestDuration?.confidence ?? 1),
    basedOnSampleSize: Math.max(...[byCategory, byHookPattern, byDuration].map((s) => s[0]?.sampleSize ?? 0)),
    explorationRate: opts.explorationRate,
  };
}
