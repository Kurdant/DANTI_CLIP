import type { ServerEnv } from "./env.js";
import { dbQuery } from "../auth/middleware.js";
import {
  scoreTopic,
  scoreHook,
  type TopicEvaluation,
  type TopicScoreResult,
  type HookScores,
} from "../../../src/content-engine/scoring.js";
import {
  DEFAULT_TOPIC_SCORING,
  DEFAULT_HOOK_SCORING,
  type TopicScoringConfig,
  type HookScoringConfig,
} from "../../../src/content-engine/config.js";
import { fallbackEvaluation } from "../../../src/content-engine/anti-banality.js";
import { logContentEvent } from "../../../src/content-engine/logging.js";
import type { EvaluatedTopic } from "../../../src/content-engine/evaluator.js";

// ============================================================
// CONTENT ENGINE - persistance et selection des candidats.
// Les scores sont decomposes et versionnes : chaque decision
// est rejouable et auditable.
// ============================================================

export interface IdeaInput {
  sujet: string;
  titre?: string | null;
  hook?: string | null;
  angle?: string | null;
  fond?: string | null;
}

export interface CandidateRow {
  id: number;
  user_id: number;
  project_id: number | null;
  title: string;
  idea_text: string;
  angle: string;
  source: string;
  total_score: number | null;
  banality_score: number | null;
  saturation_score: number | null;
  credibility_score: number | null;
  score_detail: string | null;
  status: string;
  created_at: string;
}

/** Mapping critere -> colonne de la table topic_candidates. */
const CRITERION_COLUMN: Record<string, string> = {
  demand: "demand_score",
  curiosity: "curiosity_score",
  emotionalImpact: "emotional_impact_score",
  novelty: "novelty_score",
  visualPotential: "visual_score",
  commentPotential: "comment_score",
  sharePotential: "share_score",
  searchPotential: "search_score",
  audienceRelevance: "audience_relevance_score",
  credibility: "credibility_score",
  saturation: "saturation_score",
  banality: "banality_score",
  followUpPotential: "follow_up_score",
};

/**
 * Persiste les idees generees comme candidats avec leur score decompose.
 * `evaluations` est indexe comme `idees` ; une entree absente ou un tableau
 * absent declenche le repli heuristique pour le candidat concerne.
 */
export function saveIdeasAsCandidates(
  env: ServerEnv,
  userId: number,
  projectId: number | null,
  idees: IdeaInput[],
  evaluations?: (EvaluatedTopic | undefined)[],
  config: TopicScoringConfig = DEFAULT_TOPIC_SCORING,
): number[] {
  const ids: number[] = [];
  for (let i = 0; i < idees.length; i++) {
    const idea = idees[i];
    const evaluation: EvaluatedTopic = evaluations?.[i] ?? fallbackEvaluation(idea.sujet ?? idea.titre ?? "");
    const result: TopicScoreResult = scoreTopic(evaluation, config);

    const columns = ["user_id", "project_id", "title", "idea_text", "angle", "source", "total_score", "score_version", "score_detail", "status"];
    const values: unknown[] = [
      userId,
      projectId,
      (idea.titre || idea.sujet || "").slice(0, 500),
      (idea.sujet || "").slice(0, 500),
      (idea.angle || "").slice(0, 30),
      "llm",
      result.total,
      config.version,
      JSON.stringify({ positive: result.positive, penalties: result.penalties, reasons: result.reasons, justification: evaluation.justification, rejected: result.rejected }),
      result.rejected ? "rejected" : "candidate",
    ];
    for (const [criterion, column] of Object.entries(CRITERION_COLUMN)) {
      columns.push(column);
      values.push(evaluation.scores[criterion as keyof typeof evaluation.scores]);
    }

    const info = dbQuery(
      env,
      `INSERT INTO topic_candidates (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      values,
    ).run();
    const candidateId = Number(info.lastInsertRowid);
    ids.push(candidateId);

    // Categories (phase 14) : liaison multi-categories.
    const cats = evaluation.categories ?? [];
    if (cats.length > 0) {
      const catRows = dbQuery(
        env,
        `SELECT id, slug FROM categories WHERE slug IN (${cats.map(() => "?").join(", ")})`,
        cats,
      ).all() as { id: number; slug: string }[];
      const insertLink = dbQuery(env, "INSERT OR IGNORE INTO topic_categories (topic_candidate_id, category_id) VALUES (?, ?)");
      for (const c of catRows) insertLink.run(candidateId, c.id);
    }

    logContentEvent("TOPIC_DISCOVERED", {
      userId,
      projectId: projectId ?? undefined,
      topicCandidateId: candidateId,
      data: { source: "llm", total: result.total },
    });
    if (result.rejected) {
      logContentEvent("TOPIC_REJECTED", {
        userId,
        projectId: projectId ?? undefined,
        topicCandidateId: candidateId,
        data: { reasons: result.reasons },
      });
    }
  }
  return ids;
}

/** Candidats d'un projet, du meilleur score au moins bon. */
export function candidatesForProject(env: ServerEnv, projectId: number): CandidateRow[] {
  return dbQuery(
    env,
    "SELECT * FROM topic_candidates WHERE project_id = ? ORDER BY total_score DESC, id ASC",
    [projectId],
  ).all() as unknown as CandidateRow[];
}

/** Meilleur candidat non rejete d'un projet, ou null. */
export function selectBestCandidateId(env: ServerEnv, projectId: number): number | null {
  const row = dbQuery(
    env,
    `SELECT id FROM topic_candidates
     WHERE project_id = ? AND status != 'rejected' AND total_score IS NOT NULL
     ORDER BY total_score DESC, id ASC LIMIT 1`,
    [projectId],
  ).get() as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

/**
 * Archive les candidats d'une generation remplacee (nouvelles idees) :
 * ils passent en 'rejected' avec la raison. Les videos deja liees gardent
 * leur reference (ON DELETE SET NULL uniquement sur suppression reelle).
 */
export function archiveProjectCandidates(env: ServerEnv, projectId: number, reason: string): void {
  dbQuery(
    env,
    "UPDATE topic_candidates SET status = 'rejected', score_detail = score_detail || ? WHERE project_id = ? AND status != 'rejected'",
    [`\n${reason}`, projectId],
  ).run();
}

/** Candidat correspondant a une idee selectionnee (par texte), ou null. */
export function candidateForIdea(env: ServerEnv, projectId: number, ideaId: number): CandidateRow | null {
  const row = dbQuery(
    env,
    `SELECT tc.* FROM topic_candidates tc
     JOIN ideas i ON i.project_id = tc.project_id AND i.idea_text = tc.idea_text
     WHERE tc.project_id = ? AND i.id = ?
     ORDER BY tc.id DESC LIMIT 1`,
    [projectId, ideaId],
  ).get() as CandidateRow | undefined;
  return row ?? null;
}

/** Id de l'idee correspondant a un candidat (meme texte), ou null. */
export function ideaIdForCandidate(env: ServerEnv, projectId: number, candidateId: number): number | null {
  const cand = dbQuery(env, "SELECT idea_text FROM topic_candidates WHERE id = ?", [candidateId]).get() as { idea_text: string } | undefined;
  if (!cand) return null;
  const idea = dbQuery(
    env,
    "SELECT id FROM ideas WHERE project_id = ? AND idea_text = ? ORDER BY id DESC LIMIT 1",
    [projectId, cand.idea_text],
  ).get() as { id: number } | undefined;
  return idea ? Number(idea.id) : null;
}

/** Marque le candidat choisi pour la production. */
export function markCandidateSelected(env: ServerEnv, candidateId: number): void {
  dbQuery(env, "UPDATE topic_candidates SET status = 'selected' WHERE id = ?", [candidateId]).run();
}

/** Marque un candidat comme rejete, avec la raison en detail. */
export function markCandidateRejected(env: ServerEnv, candidateId: number, reason: string): void {
  dbQuery(env, "UPDATE topic_candidates SET status = 'rejected', score_detail = score_detail || ? WHERE id = ?", [`\nrejet manuel: ${reason}`, candidateId]).run();
}

/** Meilleur candidat selectionne d'un projet (pour lier la video). */
export function selectedCandidateForProject(env: ServerEnv, projectId: number): CandidateRow | null {
  const row = dbQuery(
    env,
    "SELECT * FROM topic_candidates WHERE project_id = ? AND status = 'selected' ORDER BY id DESC LIMIT 1",
    [projectId],
  ).get() as CandidateRow | undefined;
  return row ?? null;
}

// ------------------------------------------------------------
// Hooks (lot 4) : persistance des variantes scorees + selection.
// ------------------------------------------------------------

export interface HookRow {
  id: number;
  topic_candidate_id: number;
  hook_text: string;
  pattern: string | null;
  total_score: number | null;
  status: string;
  created_at: string;
}

/** Persiste des variantes de hook avec leur score (rejet sous le seuil). */
export function saveHooks(
  env: ServerEnv,
  candidateId: number,
  hooks: { hook_text: string; pattern?: string | null; scores: HookScores; justification?: string }[],
  config: HookScoringConfig = DEFAULT_HOOK_SCORING,
): number[] {
  const ids: number[] = [];
  for (const h of hooks) {
    const total = scoreHook(h.scores, config);
    const info = dbQuery(
      env,
      `INSERT INTO hooks (topic_candidate_id, hook_text, pattern, curiosity_score, clarity_score,
         specificity_score, surprise_score, emotional_impact_score, open_loop_score,
         credibility_score, scroll_stopping_score, total_score, score_version, score_detail, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        candidateId,
        h.hook_text.slice(0, 200),
        h.pattern ?? null,
        h.scores.curiosity, h.scores.clarity, h.scores.specificity, h.scores.surprise,
        h.scores.emotionalImpact, h.scores.openLoop, h.scores.credibility, h.scores.scrollStoppingPotential,
        total,
        config.version,
        h.justification ?? null,
        total >= config.minTotalScore ? "candidate" : "rejected",
      ],
    ).run();
    const hookId = Number(info.lastInsertRowid);
    ids.push(hookId);
    if (total < config.minTotalScore) {
      logContentEvent("HOOK_REJECTED", {
        topicCandidateId: candidateId,
        hookId,
        data: { total },
      });
    }
  }
  return ids;
}

/** Meilleur hook non rejete d'un candidat, ou null. */
export function selectBestHookId(env: ServerEnv, candidateId: number): number | null {
  const row = dbQuery(
    env,
    `SELECT id FROM hooks WHERE topic_candidate_id = ? AND status != 'rejected' AND total_score IS NOT NULL
     ORDER BY total_score DESC, id ASC LIMIT 1`,
    [candidateId],
  ).get() as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

/** Texte du meilleur hook non rejete d'un candidat, ou null. */
export function bestHookText(env: ServerEnv, candidateId: number): string | null {
  const id = selectBestHookId(env, candidateId);
  if (id == null) return null;
  const row = dbQuery(env, "SELECT hook_text FROM hooks WHERE id = ?", [id]).get() as { hook_text: string } | undefined;
  return row?.hook_text ?? null;
}

/** Tous les hooks non rejetes d'un candidat, du meilleur score au moins bon. */
export function hooksForCandidate(env: ServerEnv, candidateId: number): HookRow[] {
  return dbQuery(
    env,
    `SELECT * FROM hooks WHERE topic_candidate_id = ? AND status != 'rejected'
     ORDER BY total_score DESC, id ASC`,
    [candidateId],
  ).all() as unknown as HookRow[];
}

/** Scores des candidats d'un projet, indexes par texte d'idee (dernier candidat gagne). */
export function candidateScoreMap(env: ServerEnv, projectId: number): Map<string, { total: number | null; status: string }> {
  const rows = dbQuery(
    env,
    "SELECT idea_text, total_score, status FROM topic_candidates WHERE project_id = ? ORDER BY id DESC",
    [projectId],
  ).all() as { idea_text: string; total_score: number | null; status: string }[];
  const map = new Map<string, { total: number | null; status: string }>();
  for (const r of rows) {
    if (!map.has(r.idea_text)) map.set(r.idea_text, { total: r.total_score, status: r.status });
  }
  return map;
}

/** Marque le hook choisi. */
export function markHookSelected(env: ServerEnv, hookId: number): void {
  dbQuery(env, "UPDATE hooks SET status = 'selected' WHERE id = ?", [hookId]).run();
}

/** Copie les categories du candidat vers la video (phase 14). */
export function linkVideoCategories(env: ServerEnv, videoId: number, candidateId: number | null): void {
  if (candidateId == null) return;
  const rows = dbQuery(env, "SELECT category_id FROM topic_categories WHERE topic_candidate_id = ?", [candidateId]).all() as { category_id: number }[];
  const ins = dbQuery(env, "INSERT OR IGNORE INTO video_categories (video_id, category_id) VALUES (?, ?)");
  for (const r of rows) ins.run(videoId, r.category_id);
}
