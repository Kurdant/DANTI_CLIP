export interface Idea {
  id: number;
  position: number;
  ideaText: string;
  titre: string | null;
  hook: string | null;
  angle: string | null;
  fond: string | null;
}

export interface ScriptPart {
  partie: string;
  texte: string;
  duree: string;
}
export interface Script {
  titre: string;
  titre_youtube?: string;
  hook: string;
  duree: string;
  texte_continu: string;
  structure: ScriptPart[];
  fond: string;
  description?: string;
  hashtags?: string[];
}
export interface ScriptDto {
  id: number;
  script: Script;
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

export interface MusicTrack {
  fileName: string;
  title: string;
  url: string;
}

export interface SfxFile {
  fileName: string;
  title: string;
  url: string;
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

export interface LibraryVideo {
  id: number;
  projectId: number;
  projectTitle: string;
  title: string | null;
  description: string | null;
  tags: string[];
  url: string;
  downloadUrl: string;
  duration: number | null;
  createdAt: string;
  youtubeId: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  statsUpdatedAt: string | null;
  statsStatus: string | null;
}

export interface YouTubeStatus {
  configured: boolean;
  connected: boolean;
  hasOwnCredentials: boolean;
}

export interface VideoTypeDef {
  id: string;
  label: string;
  description: string;
}

export interface Project {
  id: number;
  title: string;
  topic: string;
  mode: "auto" | "manual";
  status: "draft" | "ideas" | "script" | "voice" | "done";
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
  ideas?: Idea[];
  scripts?: ScriptDto[];
  voices?: VoiceDto[];
  videos?: VideoDto[];
}

export interface Background {
  fileName: string;
  source: "default" | "user";
  downloadUrl: string;
  thumbUrl: string;
}

export type AutomationSchedule =
  | { mode: "interval"; start: string; end: string }
  | { mode: "times"; times: string[] };

export interface AutomationLastResult {
  status: string;
  reason?: string;
  projectId?: number | null;
  videoId?: number | null;
  url?: string;
  error?: string;
}

export interface Automation {
  id: number;
  name: string;
  enabled: boolean;
  videoTypes: string[];
  perDay: number;
  schedule: AutomationSchedule;
  voiceName: string | null;
  background: string | null;
  textStyle: string;
  topic: string;
  privacy: "private" | "unlisted" | "public";
  timezone: string;
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
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: AutomationLastResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationStatus {
  rules: number;
  active: number;
  youtubeConnected: boolean;
  nextRuns: { id: number; name: string; nextRunAt: string }[];
}

export interface BackgroundList {
  backgrounds: Background[];
  maxUploadBytes: number;
  usedBytes: number;
  quotaBytes: number;
}

export interface VoiceOption {
  name: string;
  locale: string;
  gender: string;
  personalities: string[];
}
