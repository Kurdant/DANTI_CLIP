// ============================================================
// CONTENT ENGINE - journal structure des decisions (phase 28).
// Evenements JSON sur console (collectables par le deploiement),
// sans secret ni donnee personnelle. Chaque evenement porte
// les identifiants et la raison de la decision.
// ============================================================

export type ContentEventName =
  | "TOPIC_DISCOVERED"
  | "TOPIC_REJECTED"
  | "TOPIC_SELECTED"
  | "HOOK_GENERATED"
  | "HOOK_REJECTED"
  | "SCRIPT_GENERATED"
  | "FACT_CHECK_FAILED"
  | "VIDEO_GENERATED"
  | "VIDEO_PUBLISHED"
  | "ANALYTICS_UPDATED"
  | "PERFORMANCE_ANALYZED"
  | "LEARNING_UPDATED"
  | "EXPERIMENT_STARTED"
  | "EXPERIMENT_COMPLETED"
  /** Usage LLM : provider, modele, tache, tokens, duree, fallback. */
  | "LLM_USAGE";

export interface ContentLogEntry {
  event: ContentEventName;
  /** Horodatage ISO. */
  ts: string;
  /** Compte concerne (jamais de nom/pseudo). */
  userId?: number;
  projectId?: number;
  topicCandidateId?: number;
  videoId?: number;
  hookId?: number;
  /** Valeurs annexes non sensibles (scores, raisons, sources). */
  data?: Record<string, unknown>;
}

/** Recepteur de log injectable (tests). Defaut : console.log JSON. */
export type ContentLogSink = (line: string) => void;

const defaultSink: ContentLogSink = (line) => console.log(line);

let sink: ContentLogSink = defaultSink;

/** Remplace le recepteur (tests uniquement). */
export function setContentLogSink(next: ContentLogSink): void {
  sink = next;
}

/** Remet le recepteur par defaut (teardown de tests). */
export function resetContentLogSink(): void {
  sink = defaultSink;
}

export function logContentEvent(event: ContentEventName, fields: Omit<ContentLogEntry, "event" | "ts">): void {
  const entry: ContentLogEntry = { event, ts: new Date().toISOString(), ...fields };
  sink(JSON.stringify(entry));
}
