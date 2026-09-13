import type { ServerEnv } from "./env.js";
import { dbQuery } from "../auth/middleware.js";
import type { ScriptResult } from "../../../src/prompts.js";
import { DEFAULT_VIDEO_TYPE } from "../../../src/videoTypes.js";

interface ProjectRow {
  id: number;
  user_id: number;
  title: string;
  topic: string;
  mode: string;
  status: string;
  selected_idea_id: number | null;
  selected_script_id: number | null;
  selected_voice_id: number | null;
  selected_background: string | null;
  text_style: string;
  video_type: string;
  created_at: string;
  updated_at: string;
}

export interface IdeaDto {
  id: number;
  position: number;
  ideaText: string;
  titre: string | null;
  hook: string | null;
  angle: string | null;
  fond: string | null;
}
export interface ScriptDto {
  id: number;
  script: ScriptResult;
  validated: boolean;
}
export interface VoiceDto {
  id: number;
  voiceName: string;
  url: string;
  downloadUrl: string;
  duration: number | null;
  rate: string | null;
  pitch: string | null;
}
export interface VideoDto {
  id: number;
  url: string;
  downloadUrl: string;
  duration: number | null;
  kept: boolean;
  title: string | null;
  description: string | null;
  tags: string[];
  youtubeId: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  statsUpdatedAt: string | null;
  statsStatus: string | null;
}
export interface ProjectDto {
  id: number;
  title: string;
  topic: string;
  mode: string;
  status: string;
  selectedIdeaId: number | null;
  selectedScriptId: number | null;
  selectedVoiceId: number | null;
  selectedBackground: string | null;
  textStyle: string;
  videoType: string;
  musicEnabled: boolean;
  musicTrack: string | null;
  musicVolume: number | null;
  sfxEnabled: boolean;
  sfxIntro: string | null;
  sfxVolume: number | null;
  effectsEnabled: boolean;
  brollEnabled: boolean;
  voiceRate: number | null;
  voicePitch: number | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeProject(row: Record<string, unknown>): ProjectDto {
  const id = Number(row.id);
  return {
    id,
    title: String(row.title),
    topic: String(row.topic),
    mode: String(row.mode),
    status: String(row.status),
    selectedIdeaId: row.selected_idea_id != null ? Number(row.selected_idea_id) : null,
    selectedScriptId: row.selected_script_id != null ? Number(row.selected_script_id) : null,
    selectedVoiceId: row.selected_voice_id != null ? Number(row.selected_voice_id) : null,
    selectedBackground: row.selected_background ? String(row.selected_background) : null,
    textStyle: String(row.text_style || "classic"),
    videoType: String(row.video_type || DEFAULT_VIDEO_TYPE),
    musicEnabled: Number(row.music_enabled ?? 0) === 1,
    musicTrack: row.music_track ? String(row.music_track) : null,
    musicVolume: row.music_volume != null ? Number(row.music_volume) : null,
    sfxEnabled: Number(row.sfx_enabled ?? 1) === 1,
    sfxIntro: row.sfx_intro ? String(row.sfx_intro) : null,
    sfxVolume: row.sfx_volume != null ? Number(row.sfx_volume) : null,
    effectsEnabled: Number(row.effects_enabled ?? 1) === 1,
    brollEnabled: Number(row.broll_enabled ?? 1) === 1,
    voiceRate: row.voice_rate != null ? Number(row.voice_rate) : null,
    voicePitch: row.voice_pitch != null ? Number(row.voice_pitch) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function getIdeas(env: ServerEnv, projectId: number): IdeaDto[] {
  const rows = dbQuery(
    env,
    "SELECT id, position, idea_text, titre, hook, angle, fond FROM ideas WHERE project_id = ? ORDER BY position ASC",
    [projectId],
  ).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    position: Number(r.position),
    ideaText: String(r.idea_text),
    titre: r.titre ? String(r.titre) : null,
    hook: r.hook ? String(r.hook) : null,
    angle: r.angle ? String(r.angle) : null,
    fond: r.fond ? String(r.fond) : null,
  }));
}

export function getScripts(env: ServerEnv, projectId: number): ScriptDto[] {
  const rows = dbQuery(
    env,
    "SELECT id, script_json, validated FROM scripts WHERE project_id = ? ORDER BY created_at DESC",
    [projectId],
  ).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    script: JSON.parse(String(r.script_json)) as ScriptResult,
    validated: Number(r.validated) === 1,
  }));
}

export function getVoices(env: ServerEnv, projectId: number): VoiceDto[] {
  const rows = dbQuery(
    env,
    "SELECT id, voice_name, file_name, duration, rate, pitch FROM voices WHERE project_id = ? ORDER BY created_at ASC",
    [projectId],
  ).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    voiceName: String(r.voice_name),
    url: `/api/audio/${Number(r.id)}`,
    downloadUrl: `/api/audio/${Number(r.id)}/download`,
    duration: r.duration != null ? Number(r.duration) : null,
    rate: r.rate ? String(r.rate) : null,
    pitch: r.pitch ? String(r.pitch) : null,
  }));
}

export function getVideos(env: ServerEnv, projectId: number): VideoDto[] {
  const rows = dbQuery(
    env,
    "SELECT id, file_name, duration, kept, title, description, tags, youtube_id, views, likes, comments, stats_updated_at, stats_status FROM videos WHERE project_id = ? ORDER BY created_at DESC",
    [projectId],
  ).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    url: `/api/video/${Number(r.id)}`,
    downloadUrl: `/api/video/${Number(r.id)}/download`,
    duration: r.duration != null ? Number(r.duration) : null,
    kept: Number(r.kept) === 1,
    title: r.title ? String(r.title) : null,
    description: r.description ? String(r.description) : null,
    tags: parseTags(r.tags),
    youtubeId: r.youtube_id ? String(r.youtube_id) : null,
    views: r.views != null ? Number(r.views) : null,
    likes: r.likes != null ? Number(r.likes) : null,
    comments: r.comments != null ? Number(r.comments) : null,
    statsUpdatedAt: r.stats_updated_at ? String(r.stats_updated_at) : null,
    statsStatus: r.stats_status ? String(r.stats_status) : null,
  }));
}

/** Parse le champ `tags` (JSON) en tableau de chaines, sans jamais planter. */
export function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* tags invalides : ignore */
  }
  return [];
}

export function getProjectRow(env: ServerEnv, projectId: number, userId: number): ProjectRow | null {
  const row = dbQuery(
    env,
    "SELECT * FROM projects WHERE id = ? AND user_id = ?",
    [projectId, userId],
  ).get() as ProjectRow | undefined;
  return row ?? null;
}
