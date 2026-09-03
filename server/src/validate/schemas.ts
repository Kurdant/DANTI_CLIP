import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(512),
});

export const createProjectSchema = z.object({
  topic: z.string().trim().max(500).optional(), // vide => l'IA invente librement 3 sujets
  mode: z.enum(["auto", "manual"]),
  title: z.string().trim().min(1).max(200).optional(),
});

export const selectIdeaSchema = z.object({
  ideaId: z.number().int().positive(),
});

export const scriptActionSchema = z.object({
  scriptId: z.number().int().positive(),
});

export const voiceSchema = z.object({
  voiceName: z.string().min(1).max(100).optional(),
});

export const backgroundSchema = z.object({
  fileName: z.string().min(1).max(200),
});
