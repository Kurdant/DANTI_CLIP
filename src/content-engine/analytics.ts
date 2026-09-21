// ============================================================
// CONTENT ENGINE - analytics : calculs purs sur les metriques
// reellement disponibles (jamais de taux invente). Une metrique
// absente est null, jamais un faux zero.
// ============================================================

export interface VideoMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
}

export interface DerivedRates {
  /** likes / views, ou null si denominateur indisponible. */
  likeRate: number | null;
  /** comments / views, ou null si denominateur indisponible. */
  commentRate: number | null;
}

/** Taux derives avec denominateur protege (views > 0 uniquement). */
export function deriveRates(m: VideoMetrics): DerivedRates {
  const views = m.views;
  const valid = views != null && Number.isFinite(views) && views > 0;
  const rate = (n: number | null): number | null => {
    if (!valid || n == null || !Number.isFinite(n)) return null;
    return n / (views as number);
  };
  return { likeRate: rate(m.likes), commentRate: rate(m.comments) };
}

/** Statistiques d'un echantillon (moyenne + mediane, robustes aux absents). */
export function summarize(values: number[]): { count: number; sum: number; mean: number | null; median: number | null } {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { count: 0, sum: 0, mean: null, median: null };
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    count: finite.length,
    sum: finite.reduce((a, b) => a + b, 0),
    mean: finite.reduce((a, b) => a + b, 0) / finite.length,
    median,
  };
}

/** Metriques d'une video : extrait les champs numeriques (null si absents). */
export function metricsOf(row: { views?: number | null; likes?: number | null; comments?: number | null }): VideoMetrics {
  const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { views: num(row.views), likes: num(row.likes), comments: num(row.comments) };
}
