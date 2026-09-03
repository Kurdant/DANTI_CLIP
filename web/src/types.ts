export interface Idea {
  id: number;
  position: number;
  ideaText: string;
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
  hook: string;
  duree: string;
  texte_continu: string;
  structure: ScriptPart[];
  fond: string;
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
  createdAt: string;
  updatedAt: string;
  ideas?: Idea[];
  scripts?: ScriptDto[];
  voices?: VoiceDto[];
}

export interface Background {
  fileName: string;
  downloadUrl: string;
}

export interface VoiceOption {
  name: string;
  locale: string;
  gender: string;
  personalities: string[];
}
