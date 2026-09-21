import type { ServerEnv } from "./env.js";
import { dbQuery } from "../auth/middleware.js";
import {
  aggregateByDimension,
  buildRecommendation,
  durationBucket,
  withinRecency,
  type DimensionStats,
  type Recommendation,
  type VideoObservation,
} from "../../../src/content-engine/learning.js";
import { loadContentEngineConfig } from "../../../src/content-engine/config.js";
import { logContentEvent } from "../../../src/content-engine/logging.js";

// ============================================================
// CONTENT ENGINE - learning : observations reelles du compte,
// agregats prudents et recommandation persistee (lot 7).
// ============================================================

interface VideoRow {
  videoId: number;
  duration: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  capturedAt: string | null;
  hookPattern: string | null;
  category: string | null;
}

/** Observations du compte : dernier snapshot par video + dimensions du contenu. */
export function gatherObservations(env: ServerEnv, userId: number): VideoObservation[] {
  const rows = dbQuery(
    env,
    `SELECT v.id AS videoId, v.duration, vs.views, vs.likes, vs.comments, vs.captured_at AS capturedAt,
            h.pattern AS hookPattern, c.slug AS category
     FROM videos v
     JOIN projects p ON p.id = v.project_id AND p.user_id = ?
     LEFT JOIN video_stats vs ON vs.id = (SELECT id FROM video_stats WHERE video_id = v.id ORDER BY id DESC LIMIT 1)
     LEFT JOIN hooks h ON h.id = v.hook_id
     LEFT JOIN video_categories vc ON vc.video_id = v.id
     LEFT JOIN categories c ON c.id = vc.category_id
     ORDER BY v.id`,
    [userId],
  ).all() as unknown as VideoRow[];

  const byVideo = new Map<number, { row: Omit<VideoRow, "category">; categories: string[] }>();
  for (const r of rows) {
    const existing = byVideo.get(r.videoId);
    if (existing) {
      if (r.category && !existing.categories.includes(r.category)) existing.categories.push(r.category);
      continue;
    }
    byVideo.set(r.videoId, {
      row: { videoId: r.videoId, duration: r.duration, views: r.views, likes: r.likes, comments: r.comments, capturedAt: r.capturedAt, hookPattern: r.hookPattern },
      categories: r.category ? [r.category] : [],
    });
  }

  const observations: VideoObservation[] = [];
  for (const { row, categories } of byVideo.values()) {
    const base = {
      videoId: row.videoId,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      capturedAt: row.capturedAt,
      hookPattern: row.hookPattern,
      durationSec: row.duration,
    };
    if (categories.length === 0) {
      observations.push({ ...base, category: null });
    } else {
      for (const c of categories) observations.push({ ...base, category: c });
    }
  }
  return observations;
}

export interface RecommendationReport {
  recommendation: Recommendation;
  byCategory: DimensionStats[];
  byHookPattern: DimensionStats[];
  byDuration: DimensionStats[];
  totalObservations: number;
}

/** Calcule, persiste et retourne la recommandation du prochain contenu. */
export function computeAndPersistRecommendation(env: ServerEnv, userId: number): RecommendationReport {
  const config = loadContentEngineConfig();
  const recent = withinRecency(gatherObservations(env, userId), config.learning.recencyWindowDays);
  const byCategory = aggregateByDimension(recent, (o) => o.category, config.learning.minSampleSize);
  const byHookPattern = aggregateByDimension(recent, (o) => o.hookPattern, config.learning.minSampleSize);
  const byDuration = aggregateByDimension(recent, (o) => durationBucket(o.durationSec), config.learning.minSampleSize);

  const recommendation = buildRecommendation(byCategory, byHookPattern, byDuration, {
    explorationRate: config.explorationRate,
    minSampleSize: config.learning.minSampleSize,
  });

  dbQuery(
    env,
    "INSERT INTO content_decisions (user_id, decision_json) VALUES (?, ?)",
    [userId, JSON.stringify({ recommendation, byCategory, byHookPattern, byDuration, totalObservations: recent.length, configVersion: config.topicScoring.version })],
  ).run();

  logContentEvent("LEARNING_UPDATED", {
    userId,
    data: { mode: recommendation.mode, totalObservations: recent.length },
  });

  return { recommendation, byCategory, byHookPattern, byDuration, totalObservations: recent.length };
}
