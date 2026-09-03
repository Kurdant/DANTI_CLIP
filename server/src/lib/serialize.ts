import type { ServerEnv } from "./env.js";
import { dbQuery } from "../auth/middleware.js";
import type { ScriptResult } from "../../../src/prompts.js";

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
}
export interface VideoDto {
  id: number;
  url: string;
  downloadUrl: string;
  duration: number | null;
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
    "SELECT id, voice_name, file_name, duration FROM voices WHERE project_id = ? ORDER BY created_at ASC",
    [projectId],
  ).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    voiceName: String(r.voice_name),
    url: `/api/audio/${Number(r.id)}`,
    downloadUrl: `/api/audio/${Number(r.id)}/download`,
    duration: r.duration != null ? Number(r.duration) : null,
  }));
}

export function getVideos(env: ServerEnv, projectId: number): VideoDto[] {
  const rows = dbQuery(
    env,
    "SELECT id, file_name, duration FROM videos WHERE project_id = ? ORDER BY created_at DESC",
    [projectId],
  ).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    url: `/api/video/${Number(r.id)}`,
    downloadUrl: `/api/video/${Number(r.id)}/download`,
    duration: r.duration != null ? Number(r.duration) : null,
  }));
}

export function getProjectRow(env: ServerEnv, projectId: number, userId: number): ProjectRow | null {
  const row = dbQuery(
    env,
    "SELECT * FROM projects WHERE id = ? AND user_id = ?",
    [projectId, userId],
  ).get() as ProjectRow | undefined;
  return row ?? null;
}
