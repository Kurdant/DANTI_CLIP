import type { LlmMessage } from "./llm/types.js";
import { messagesIdees, messagesScript } from "./prompts.js";
import { messagesIdeesTest, messagesScriptTest } from "./prompts-test.js";

// ============================================================
// REGISTRE DES TYPES DE VIDEO.
// Chaque type = un jeu de prompts dedie, branche sur le meme flux
// (idees -> script -> voix -> video). Le projet porte son type et
// le flux utilise les prompts de ce type.
// Ajouter un type ici suffit pour qu'il devienne utilisable.
// ============================================================

export interface VideoTypeDef {
  id: string;
  label: string;
  description: string;
  messagesIdees: (opts: { topic: string; nIdeas: number; language?: string; usedTopics?: string[] }) => LlmMessage[];
  messagesScript: (opts: { idea: string; language?: string; hook?: string; feedback?: string }) => LlmMessage[];
}

export const DEFAULT_VIDEO_TYPE = "culture-generale";

export const VIDEO_TYPES: Record<string, VideoTypeDef> = {
  "culture-generale": {
    id: "culture-generale",
    label: "Culture Générale",
    description: "Des faits insolites, des chiffres qui surprennent et des mythes démystifiés qui accrochent en 1 seconde.",
    messagesIdees,
    messagesScript,
  },
  "test": {
    id: "test",
    label: "Test",
    description: "Bac a sable : ton hype/goofy, gros hook plein ecran. A experimenter avant d'appliquer a la prod.",
    messagesIdees: messagesIdeesTest,
    messagesScript: messagesScriptTest,
  },
};

export const VIDEO_TYPE_IDS = Object.keys(VIDEO_TYPES);

export function getVideoType(id: string | null | undefined): VideoTypeDef {
  return (id && VIDEO_TYPES[id]) || VIDEO_TYPES[DEFAULT_VIDEO_TYPE];
}

export function listVideoTypes(): { id: string; label: string; description: string }[] {
  return Object.values(VIDEO_TYPES).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
  }));
}
