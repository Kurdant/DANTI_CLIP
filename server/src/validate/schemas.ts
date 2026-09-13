import { z } from "zod";
import { VIDEO_TYPE_IDS } from "../../../src/videoTypes.js";
import { TEXT_STYLE_IDS } from "../../../src/subs.js";

export const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(512),
});

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Name too short (min 3 characters)")
    .max(30, "Name too long (max 30)"),
  password: z.string().min(8, "Password too short (min 8 characters)").max(512),
});

export const createProjectSchema = z.object({
  topic: z.string().trim().max(500).optional(), // vide => l'IA invente librement 3 sujets
  mode: z.enum(["auto", "manual"]),
  title: z.string().trim().min(1).max(200).optional(),
  videoType: z.enum(VIDEO_TYPE_IDS as [string, ...string[]]).optional(),
});

export const updateProjectSchema = z.object({
  topic: z.string().trim().max(500).optional(),
});

export const selectIdeaSchema = z.object({
  ideaId: z.number().int().positive(),
});

export const scriptActionSchema = z.object({
  scriptId: z.number().int().positive(),
});

export const voiceSchema = z.object({
  voiceName: z.string().min(1).max(100).optional(),
  /** Vitesse en % (ex: 8 = +8%). Plage raisonnable pour garder une voix intelligible. */
  rate: z.number().min(-50).max(50).optional(),
  /** Hauteur en Hz (ex: -2 = -2Hz). */
  pitch: z.number().min(-50).max(50).optional(),
});

export const backgroundSchema = z.object({
  fileName: z.string().min(1).max(200),
});

/** Options de rendu d'un projet (persistees via /projects/:id/render-options). */
export const projectRenderOptionsSchema = z.object({
  textStyle: z.enum(TEXT_STYLE_IDS as [string, ...string[]]).optional(),
  musicEnabled: z.boolean().optional(),
  musicTrack: z.string().min(1).max(200).nullable().optional(),
  musicVolume: z.number().min(0).max(1).optional(),
  sfxEnabled: z.boolean().optional(),
  sfxIntro: z.string().min(1).max(200).nullable().optional(),
  sfxVolume: z.number().min(0).max(1).optional(),
  effectsEnabled: z.boolean().optional(),
  brollEnabled: z.boolean().optional(),
  voiceRate: z.number().min(-50).max(50).optional(),
  voicePitch: z.number().min(-50).max(50).optional(),
});

export const automationScheduleSchema = z.union([
  z.object({ mode: z.literal("interval"), start: z.string().regex(/^\d{1,2}:\d{2}$/), end: z.string().regex(/^\d{1,2}:\d{2}$/) }),
  z.object({ mode: z.literal("times"), times: z.array(z.string().regex(/^\d{1,2}:\d{2}$/)).min(1) }),
]);

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(200),
  enabled: z.boolean().optional(),
  videoTypes: z.array(z.enum(VIDEO_TYPE_IDS as [string, ...string[]])).min(1, "Choose at least one type"),
  perDay: z.number().int().min(1).max(24),
  schedule: automationScheduleSchema,
  voiceName: z.string().min(1).max(100).optional(),
  background: z.string().min(1).max(200).nullable().optional(),
  textStyle: z.enum(TEXT_STYLE_IDS as [string, ...string[]]).optional(),
  topic: z.string().trim().max(500).optional(),
  privacy: z.enum(["private", "unlisted", "public"]).optional(),
  timezone: z.string().min(1).max(100).optional(),
  musicEnabled: z.boolean().optional(),
  musicTrack: z.string().min(1).max(200).nullable().optional(),
  musicVolume: z.number().min(0).max(1).optional(),
  sfxEnabled: z.boolean().optional(),
  sfxIntro: z.string().min(1).max(200).nullable().optional(),
  sfxVolume: z.number().min(0).max(1).optional(),
  effectsEnabled: z.boolean().optional(),
  brollEnabled: z.boolean().optional(),
  voiceRate: z.number().min(-50).max(50).optional(),
  voicePitch: z.number().min(-50).max(50).optional(),
});

export const updateAutomationSchema = createAutomationSchema.partial();

export const toggleAutomationSchema = z.object({
  enabled: z.boolean().optional(),
});
