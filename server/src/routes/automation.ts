import { Router } from "express";
import type { ServerEnv } from "../lib/env.js";
import { dbQuery, asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import {
  createAutomationSchema,
  updateAutomationSchema,
  toggleAutomationSchema,
} from "../validate/schemas.js";
import { isYouTubeConnected } from "./youtube.js";
import type { AutomationRow } from "../lib/automation.js";

function parseArray(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseLastResult(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function serializeAutomation(r: AutomationRow) {
  let schedule: unknown;
  try { schedule = JSON.parse(r.schedule); } catch { schedule = { mode: "interval", start: "08:00", end: "20:00" }; }
  return {
    id: r.id,
    name: r.name,
    enabled: Number(r.enabled) === 1,
    videoTypes: parseArray(r.video_types),
    perDay: Number(r.per_day),
    schedule,
    voiceName: r.voice_name || null,
    background: r.background || null,
    textStyle: r.text_style || "classic",
    topic: r.topic || "",
    privacy: r.privacy || "unlisted",
    timezone: r.timezone || "UTC",
    language: r.language || null,
    musicEnabled: Number(r.music_enabled ?? 0) === 1,
    musicTrack: r.music_track || null,
    musicVolume: r.music_volume != null ? Number(r.music_volume) : null,
    sfxEnabled: Number(r.sfx_enabled ?? 1) === 1,
    sfxIntro: r.sfx_intro || null,
    sfxVolume: r.sfx_volume != null ? Number(r.sfx_volume) : null,
    effectsEnabled: Number(r.effects_enabled ?? 1) === 1,
    brollEnabled: Number(r.broll_enabled ?? 1) === 1,
    voiceRate: r.voice_rate != null ? Number(r.voice_rate) : null,
    voicePitch: r.voice_pitch != null ? Number(r.voice_pitch) : null,
    nextRunAt: r.next_run_at || null,
    lastRunAt: r.last_run_at || null,
    lastResult: parseLastResult(r.last_result),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function getRule(env: ServerEnv, ruleId: number, userId: number): AutomationRow {
  const row = dbQuery(env, "SELECT * FROM automations WHERE id = ? AND user_id = ?", [ruleId, userId]).get() as AutomationRow | undefined;
  if (!row) throw new ApiError(404, "Automation rule not found");
  return row;
}

export function automationRouter(env: ServerEnv): Router {
  const router = Router();
  router.use(requireAuth);

  // --- Lister les regles de l'utilisateur ---
  router.get("/automation/rules", asyncHandler(async (req, res) => {
    const rows = dbQuery(env, "SELECT * FROM automations WHERE user_id = ? ORDER BY created_at DESC", [req.auth!.userId]).all() as unknown as AutomationRow[];
    res.json({ rules: rows.map(serializeAutomation) });
  }));

  // --- Statut global : compte YouTube connecte ? prochains runs ? ---
  router.get("/automation/status", asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const rows = dbQuery(env, "SELECT * FROM automations WHERE user_id = ?", [userId]).all() as unknown as AutomationRow[];
    const active = rows.filter((r) => Number(r.enabled) === 1);
    const youtubeConnected = await isYouTubeConnected(env, userId);
    res.json({
      rules: rows.length,
      active: active.length,
      youtubeConnected,
      nextRuns: active
        .filter((r) => r.next_run_at)
        .map((r) => ({ id: r.id, name: r.name, nextRunAt: r.next_run_at })),
    });
  }));

  // --- Creer une regle ---
  router.post("/automation/rules", csrfProtect, asyncHandler(async (req, res) => {
    const parsed = createAutomationSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");
    const d = parsed.data;

    const info = dbQuery(
      env,
      "INSERT INTO automations (user_id, name, enabled, video_types, per_day, schedule, voice_name, background, text_style, topic, privacy, timezone, language, music_enabled, music_track, music_volume, sfx_enabled, sfx_intro, sfx_volume, effects_enabled, broll_enabled, voice_rate, voice_pitch) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        req.auth!.userId,
        d.name,
        d.enabled === false ? 0 : 1,
        JSON.stringify(d.videoTypes),
        d.perDay,
        JSON.stringify(d.schedule),
        d.voiceName ?? null,
        d.background ?? null,
        d.textStyle ?? "classic",
        d.topic ?? "",
        d.privacy ?? "unlisted",
        d.timezone ?? "Europe/Paris",
        d.language ?? null,
        d.musicEnabled === true ? 1 : 0,
        d.musicTrack ?? null,
        d.musicVolume ?? null,
        d.sfxEnabled === false ? 0 : 1,
        d.sfxIntro ?? null,
        d.sfxVolume ?? null,
        d.effectsEnabled === false ? 0 : 1,
        d.brollEnabled === false ? 0 : 1,
        d.voiceRate ?? null,
        d.voicePitch ?? null,
      ],
    ).run();
    const rule = getRule(env, Number(info.lastInsertRowid), req.auth!.userId);
    res.status(201).json({ rule: serializeAutomation(rule) });
  }));

  // --- Mettre a jour une regle (replanifie le prochain creneau) ---
  router.patch("/automation/rules/:id", csrfProtect, asyncHandler(async (req, res) => {
    const rule = getRule(env, Number(req.params.id), req.auth!.userId);
    const parsed = updateAutomationSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid data");
    const d = parsed.data;

    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };
    if (d.name !== undefined) push("name", d.name);
    if (d.enabled !== undefined) push("enabled", d.enabled ? 1 : 0);
    if (d.videoTypes !== undefined) push("video_types", JSON.stringify(d.videoTypes));
    if (d.perDay !== undefined) push("per_day", d.perDay);
    if (d.schedule !== undefined) push("schedule", JSON.stringify(d.schedule));
    if (d.voiceName !== undefined) push("voice_name", d.voiceName ?? null);
    if (d.background !== undefined) push("background", d.background ?? null);
    if (d.textStyle !== undefined) push("text_style", d.textStyle);
    if (d.topic !== undefined) push("topic", d.topic ?? "");
    if (d.privacy !== undefined) push("privacy", d.privacy);
    if (d.timezone !== undefined) push("timezone", d.timezone);
    if (d.language !== undefined) push("language", d.language ?? null);
    if (d.musicEnabled !== undefined) push("music_enabled", d.musicEnabled ? 1 : 0);
    if (d.musicTrack !== undefined) push("music_track", d.musicTrack ?? null);
    if (d.musicVolume !== undefined) push("music_volume", d.musicVolume);
    if (d.sfxEnabled !== undefined) push("sfx_enabled", d.sfxEnabled ? 1 : 0);
    if (d.sfxIntro !== undefined) push("sfx_intro", d.sfxIntro ?? null);
    if (d.sfxVolume !== undefined) push("sfx_volume", d.sfxVolume);
    if (d.effectsEnabled !== undefined) push("effects_enabled", d.effectsEnabled ? 1 : 0);
    if (d.brollEnabled !== undefined) push("broll_enabled", d.brollEnabled ? 1 : 0);
    if (d.voiceRate !== undefined) push("voice_rate", d.voiceRate);
    if (d.voicePitch !== undefined) push("voice_pitch", d.voicePitch);

    if (sets.length > 0) {
      // Un changement de config replanifie le prochain creneau.
      sets.push("next_run_at = NULL");
      sets.push("updated_at = datetime('now')");
      params.push(rule.id);
      dbQuery(env, `UPDATE automations SET ${sets.join(", ")} WHERE id = ?`, params).run();
    }
    const updated = getRule(env, rule.id, req.auth!.userId);
    res.json({ rule: serializeAutomation(updated) });
  }));

  // --- Activer / desactiver ---
  router.post("/automation/rules/:id/toggle", csrfProtect, asyncHandler(async (req, res) => {
    const rule = getRule(env, Number(req.params.id), req.auth!.userId);
    const parsed = toggleAutomationSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError(400, "Invalid data");
    const enabled = parsed.data.enabled !== undefined ? parsed.data.enabled : Number(rule.enabled) !== 1;
    dbQuery(env, "UPDATE automations SET enabled = ?, next_run_at = NULL, updated_at = datetime('now') WHERE id = ?", [enabled ? 1 : 0, rule.id]).run();
    const updated = getRule(env, rule.id, req.auth!.userId);
    res.json({ rule: serializeAutomation(updated) });
  }));

  // --- Supprimer une regle ---
  router.delete("/automation/rules/:id", csrfProtect, asyncHandler(async (req, res) => {
    getRule(env, Number(req.params.id), req.auth!.userId);
    dbQuery(env, "DELETE FROM automations WHERE id = ?", [Number(req.params.id)]).run();
    res.json({ ok: true });
  }));

  return router;
}
