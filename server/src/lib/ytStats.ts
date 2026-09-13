import type { ServerEnv } from "./env.js";
import { dbQuery } from "../auth/middleware.js";

// ============================================================
// STATS YOUTUBE (chantier 2a) - vues / likes / commentaires.
// Voie cle API : videos.list?part=statistics fonctionne pour les
// videos PUBLIQUES sans OAuth, donc aucun changement de scope ni
// re-autorisation. 1 unite de quota par batch de 50 ids.
// ============================================================

const API = "https://www.googleapis.com/youtube/v3/videos";
const BATCH = 50;
const TIMEOUT_MS = 10_000;
/** Ne rafraichit pas une video deja synchronisee depuis moins de N heures. */
const STALE_HOURS = 5;

export interface StatsRefreshResult {
  users: number;
  updated: number;
  missing: number;
  skipped: number;
  error?: string;
}

interface StatsItem {
  id: string;
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

/** Parse un compteur YouTube (chaine) en nombre, ou null si absent/masque. */
function parseCount(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Appelle videos.list par batch ; erreur typee (quota vs http). */
async function fetchStats(
  apiKey: string,
  ids: string[],
): Promise<{ ok: true; items: StatsItem[] } | { ok: false; kind: "quota" | "http" }> {
  const url = `${API}?part=statistics&id=${ids.join(",")}&key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, kind: res.status === 403 ? "quota" : "http" };
    const data = (await res.json()) as { items?: StatsItem[] };
    return { ok: true, items: data.items ?? [] };
  } catch {
    return { ok: false, kind: "http" };
  }
}

/** Rafraichit les stats des videos publiees d'un utilisateur. */
export async function refreshUserVideoStats(env: ServerEnv, userId: number): Promise<StatsRefreshResult> {
  const result: StatsRefreshResult = { users: 1, updated: 0, missing: 0, skipped: 0 };
  if (!env.youtubeApiKey) {
    result.skipped = 1;
    result.error = "YOUTUBE_API_KEY not configured";
    return result;
  }

  const rows = dbQuery(
    env,
    `SELECT v.id, v.youtube_id FROM videos v
     JOIN projects p ON p.id = v.project_id
     WHERE p.user_id = ? AND v.youtube_id IS NOT NULL
       AND (v.stats_updated_at IS NULL OR v.stats_updated_at < datetime('now', ?))`,
    [userId, `-${STALE_HOURS} hours`],
  ).all() as { id: number; youtube_id: string }[];

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const ids = chunk.map((r) => String(r.youtube_id));
    const res = await fetchStats(env.youtubeApiKey, ids);
    if (!res.ok) {
      result.error = res.kind === "quota" ? "quota exceeded" : "http error";
      break;
    }
    const byId = new Map(res.items.map((it) => [it.id, it]));
    for (const row of chunk) {
      const item = byId.get(String(row.youtube_id));
      if (!item) {
        // Video supprimee ou inaccessible : on marque, sans ecraser les compteurs.
        dbQuery(env, "UPDATE videos SET stats_status = 'missing', stats_updated_at = datetime('now') WHERE id = ?", [row.id]).run();
        result.missing++;
        continue;
      }
      const s = item.statistics ?? {};
      dbQuery(
        env,
        "UPDATE videos SET views = ?, likes = ?, comments = ?, stats_status = 'ok', stats_updated_at = datetime('now') WHERE id = ?",
        [parseCount(s.viewCount) ?? 0, parseCount(s.likeCount), parseCount(s.commentCount), row.id],
      ).run();
      result.updated++;
    }
  }
  return result;
}

let running = false;

/** Rafraichit les stats de tous les utilisateurs. Ne throw jamais (job). */
export async function refreshAllVideoStats(env: ServerEnv): Promise<StatsRefreshResult> {
  const total: StatsRefreshResult = { users: 0, updated: 0, missing: 0, skipped: 0 };
  if (running) return total;
  if (!env.youtubeApiKey) {
    total.skipped = 1;
    total.error = "YOUTUBE_API_KEY not configured";
    return total;
  }
  running = true;
  try {
    const users = dbQuery(
      env,
      "SELECT DISTINCT p.user_id FROM videos v JOIN projects p ON p.id = v.project_id WHERE v.youtube_id IS NOT NULL",
    ).all() as { user_id: number }[];
    for (const u of users) {
      try {
        const r = await refreshUserVideoStats(env, Number(u.user_id));
        total.users++;
        total.updated += r.updated;
        total.missing += r.missing;
        total.skipped += r.skipped;
        if (r.error) total.error = r.error;
      } catch (e) {
        console.error("[ytstats] user error", e);
      }
    }
  } finally {
    running = false;
  }
  if (total.updated > 0 || total.missing > 0) {
    console.log(`[ytstats] updated=${total.updated} missing=${total.missing} users=${total.users}`);
  }
  return total;
}
