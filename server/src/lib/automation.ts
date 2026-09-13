import type { ServerEnv } from "./env.js";
import { dbQuery } from "../auth/middleware.js";
import { generateProject, toRate, toPitch } from "../routes/workflow.js";
import { publishVideo, isYouTubeConnected } from "../routes/youtube.js";

// ============================================================
// AUTOMATISATION - scheduler qui genere et publie seul.
// Une regle = un flux recurrent : a chaque creneau, on cree un
// projet auto, on genere (idees -> script -> voix -> video), on
// garde la video, puis on la publie sur YouTube (obligatoire).
// ============================================================

export interface AutomationRow {
  id: number;
  user_id: number;
  name: string;
  enabled: number;
  video_types: string; // JSON array
  per_day: number;
  schedule: string; // JSON { mode, start, end } | { mode, times }
  voice_name: string | null;
  background: string | null;
  text_style: string;
  topic: string;
  privacy: string;
  timezone: string;
  music_enabled?: number | null;
  music_track?: string | null;
  music_volume?: number | null;
  sfx_enabled?: number | null;
  sfx_intro?: string | null;
  sfx_volume?: number | null;
  effects_enabled?: number | null;
  broll_enabled?: number | null;
  voice_rate?: number | null;
  voice_pitch?: number | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_result: string | null;
  created_at: string;
  updated_at: string;
}

interface Schedule {
  mode: "interval" | "times";
  start?: string;
  end?: string;
  times?: string[];
}

/** Regles actuellement en train de tourner (evite le double-poste). */
const running = new Set<number>();

// ------------------------------------------------------------
// Calcul des creneaux de publication
// ------------------------------------------------------------

/** "HH:MM" -> minutes depuis minuit, ou null si invalide. */
function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function parseSchedule(rule: AutomationRow): Schedule {
  try {
    return JSON.parse(rule.schedule) as Schedule;
  } catch {
    return { mode: "interval", start: "08:00", end: "20:00" };
  }
}

/** Liste des minutes (depuis minuit) des creneaux pour la regle. */
function slotMinutes(rule: AutomationRow): number[] {
  const sched = parseSchedule(rule);
  if (sched.mode === "times") {
    return (sched.times ?? [])
      .map(parseHM)
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
  }
  const start = parseHM(sched.start ?? "08:00") ?? 8 * 60;
  const end = parseHM(sched.end ?? "20:00") ?? 20 * 60;
  const n = Math.max(1, rule.per_day);
  if (n === 1 || end <= start) return [start];
  const span = end - start;
  const times: number[] = [];
  for (let k = 0; k < n; k++) times.push(start + Math.round((k * span) / (n - 1)));
  return times;
}

// ------------------------------------------------------------
// Fuseaux horaires : les creneaux sont interpretes dans le fuseau
// de la regle (ex. Europe/Paris), pas en UTC. Sans dependance.
// ------------------------------------------------------------

/** Extrait la date (annee, mois, jour) d'un instant dans un fuseau. */
function datePartsInTz(from: Date, timeZone: string): [number, number, number] {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = dtf.formatToParts(from);
  const y = Number(p.find((x) => x.type === "year")?.value);
  const m = Number(p.find((x) => x.type === "month")?.value);
  const d = Number(p.find((x) => x.type === "day")?.value);
  return [y, m, d];
}

/** Instant (ms) correspondant a une heure locale dans un fuseau (approx convergente). */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const p = dtf.formatToParts(new Date(utc));
    const actual = Date.UTC(
      Number(p.find((x) => x.type === "year")?.value),
      Number(p.find((x) => x.type === "month")?.value) - 1,
      Number(p.find((x) => x.type === "day")?.value),
      Number(p.find((x) => x.type === "hour")?.value),
      Number(p.find((x) => x.type === "minute")?.value),
    );
    const target = Date.UTC(year, month - 1, day, hour, minute);
    utc += target - actual;
  }
  return utc;
}

function nextLocalDay(y: number, m: number, d: number): [number, number, number] {
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

/** Prochain creneau strictement apres `from`, dans le fuseau de la regle. */
export function nextSlot(rule: AutomationRow, from: Date): Date {
  const times = slotMinutes(rule);
  const tz = rule.timezone || "UTC";
  const [y, m, d] = datePartsInTz(from, tz);
  for (const t of times) {
    const cand = new Date(zonedTimeToUtc(y, m, d, Math.floor(t / 60), t % 60, tz));
    if (cand.getTime() > from.getTime()) return cand;
  }
  const first = times[0] ?? 8 * 60;
  const [ny, nm, nd] = nextLocalDay(y, m, d);
  return new Date(zonedTimeToUtc(ny, nm, nd, Math.floor(first / 60), first % 60, tz));
}

// ------------------------------------------------------------
// Creation du projet + choix du type de contenu
// ------------------------------------------------------------

/** Choisit un type de contenu parmi ceux de la regle (aleatoire, evolutif vers round-robin). */
function pickVideoType(videoTypesRaw: string): string {
  let types: string[] = [];
  try {
    const parsed = JSON.parse(videoTypesRaw) as unknown;
    if (Array.isArray(parsed)) types = parsed.map(String).filter(Boolean);
  } catch {
    types = [];
  }
  if (types.length === 0) return "culture-generale";
  return types[Math.floor(Math.random() * types.length)];
}

function createProjectForAutomation(env: ServerEnv, rule: AutomationRow): number {
  const videoType = pickVideoType(rule.video_types);
  const title = (rule.topic?.trim().slice(0, 80) || rule.name || "Auto publication").slice(0, 200);
  const info = dbQuery(
    env,
    "INSERT INTO projects (user_id, title, topic, mode, video_type, text_style, selected_background, music_enabled, music_track, music_volume, sfx_enabled, sfx_intro, sfx_volume, effects_enabled, broll_enabled, voice_rate, voice_pitch) " +
      "VALUES (?, ?, ?, 'auto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      rule.user_id,
      title,
      rule.topic || "",
      videoType,
      rule.text_style,
      rule.background || null,
      Number(rule.music_enabled ?? 0) === 1 ? 1 : 0,
      rule.music_track || null,
      rule.music_volume ?? null,
      Number(rule.sfx_enabled ?? 1) === 1 ? 1 : 0,
      rule.sfx_intro || null,
      rule.sfx_volume ?? null,
      Number(rule.effects_enabled ?? 1) === 1 ? 1 : 0,
      Number(rule.broll_enabled ?? 1) === 1 ? 1 : 0,
      rule.voice_rate ?? null,
      rule.voice_pitch ?? null,
    ],
  ).run();
  return Number(info.lastInsertRowid);
}

// ------------------------------------------------------------
// Execution d'un run
// ------------------------------------------------------------

async function runAutomation(env: ServerEnv, rule: AutomationRow): Promise<Record<string, unknown>> {
  // YouTube est un prerequis obligatoire.
  if (!(await isYouTubeConnected(env, rule.user_id))) {
    return { status: "blocked", reason: "youtube_not_connected", projectId: null, videoId: null };
  }

  const projectId = createProjectForAutomation(env, rule);
  const rate = rule.voice_rate != null ? toRate(Number(rule.voice_rate)) : undefined;
  const pitch = rule.voice_pitch != null ? toPitch(Number(rule.voice_pitch)) : undefined;
  const videoId = await generateProject(env, projectId, { voiceName: rule.voice_name || undefined, rate, pitch });

  // La video publiee ne doit jamais etre purgee.
  dbQuery(env, "UPDATE videos SET kept = 1 WHERE id = ?", [videoId]).run();

  const v = dbQuery(env, "SELECT title, description, tags FROM videos WHERE id = ?", [videoId]).get() as
    | { title: string | null; description: string | null; tags: string | null }
    | undefined;
  let tags: string[] = [];
  if (v?.tags) {
    try { tags = JSON.parse(v.tags) as string[]; } catch { tags = []; }
  }

  // Hashtags a la FIN de la description (comme pour la publication manuelle).
  const body = v?.description?.trim() || "";
  const hashtagLine = tags.map((t) => `#${t}`).join(" ");
  const fullDescription = [body, hashtagLine].filter(Boolean).join("\n\n");

  const { url } = await publishVideo(env, rule.user_id, videoId, {
    title: v?.title ?? "",
    description: fullDescription,
    tags,
    privacyStatus: rule.privacy,
  });

  return { status: "published", projectId, videoId, url };
}

// ------------------------------------------------------------
// Tick : evalue toutes les regles dues et lance les runs.
// ------------------------------------------------------------

export async function tickAutomation(env: ServerEnv): Promise<void> {
  const now = new Date();
  let rules: AutomationRow[];
  try {
    rules = dbQuery(env, "SELECT * FROM automations WHERE enabled = 1").all() as unknown as AutomationRow[];
  } catch (e) {
    console.error("[automation] reading rules:", e);
    return;
  }

  for (const rule of rules) {
    if (running.has(rule.id)) continue;
    // Initialise le premier creneau si jamais planifie.
    if (!rule.next_run_at) {
      dbQuery(env, "UPDATE automations SET next_run_at = ? WHERE id = ?", [nextSlot(rule, now).toISOString(), rule.id]).run();
      continue;
    }
    if (new Date(rule.next_run_at).getTime() > now.getTime()) continue;

    // Creneau du : avance next_run_at AVANT de lancer (anti double-poste).
    running.add(rule.id);
    dbQuery(
      env,
      "UPDATE automations SET next_run_at = ?, last_run_at = ? WHERE id = ?",
      [nextSlot(rule, now).toISOString(), now.toISOString(), rule.id],
    ).run();

    runAutomation(env, rule)
      .then((result) => {
        dbQuery(env, "UPDATE automations SET last_result = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(result), rule.id]).run();
      })
      .catch((e) => {
        console.error("[automation] run failed:", e);
        dbQuery(env, "UPDATE automations SET last_result = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify({ status: "error", error: e instanceof Error ? e.message : String(e) }), rule.id]).run();
      })
      .finally(() => running.delete(rule.id));
  }
}
