import { z } from "zod";
import { extractJson } from "./openai.js";

// ============================================================
// Validation structurelle des reponses LLM (idees / script /
// requetes images). Une reponse mal formee doit echouer ici,
// avant toute ecriture en base ou envoi au TTS.
// ============================================================

export const ideeSchema = z.object({
  sujet: z.string().trim().min(1).max(500),
  titre: z.string().trim().max(200).optional().default(""),
  hook: z.string().trim().max(200).optional().default(""),
  angle: z.string().trim().max(30).optional().default(""),
  fond: z.string().trim().max(500).optional().default(""),
});

export const ideasResultSchema = z.object({
  idees: z.array(ideeSchema).min(1).max(50),
});

export const scriptPartSchema = z.object({
  partie: z.enum(["hook", "corps", "preuve", "chute", "cta"]),
  texte: z.string().trim().min(1).max(2000),
  duree: z.string().trim().min(1).max(20),
});

export const scriptResultSchema = z.object({
  titre: z.string().trim().min(1).max(200),
  titre_youtube: z.string().trim().max(100).optional().default(""),
  hook: z.string().trim().min(1).max(200),
  duree: z.string().trim().max(20).optional().default(""),
  texte_continu: z.string().trim().min(1).max(5000),
  structure: z.array(scriptPartSchema).min(1).max(12),
  fond: z.string().trim().max(500).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  hashtags: z.array(z.string().trim().max(50)).max(30).optional().default([]),
});

export const imageQueriesSchema = z.object({
  queries: z.array(z.string().trim().min(1).max(120)).max(50),
});

export type IdeasResultParsed = z.infer<typeof ideasResultSchema>;
export type ScriptResultParsed = z.infer<typeof scriptResultSchema>;
export type ImageQueriesParsed = z.infer<typeof imageQueriesSchema>;

/** Parse une reponse LLM en JSON puis valide sa structure metier. */
export function parseLlmJson<T>(schema: z.ZodType<T>, raw: string, label: string): T {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch (e) {
    throw new Error(
      `Reponse LLM ${label} : JSON invalide (${e instanceof Error ? e.message : String(e)})`,
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "racine"}: ${i.message}`)
      .join(" ; ");
    throw new Error(`Reponse LLM ${label} : structure invalide (${issues})`);
  }
  return result.data;
}
