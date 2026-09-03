import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  UniversalEdgeTTS,
  UniversalVoicesManager,
  type Voice,
  type WordBoundary,
} from "edge-tts-universal";

export interface VoixResult {
  mp3Path: string;
  /** Timings par mot (en centaines de nanosecondes) - utiles pour les sous-titres Jalon 2 */
  wordBoundaries: WordBoundary[];
}

/**
 * Synthetise la voix d'un texte en MP3 via Edge TTS (gratuit, illimite, cote serveur).
 */
export async function syntheseVoix(
  texte: string,
  opts: {
    voice: string;
    outputPath: string;
    rate?: string;
    pitch?: string;
  },
): Promise<VoixResult> {
  const tts = new UniversalEdgeTTS(texte, opts.voice, {
    rate: opts.rate ?? "+8%", // legerement plus rapide = meilleure retention
    pitch: opts.pitch ?? "+0Hz",
  });

  const result = await tts.synthesize();
  const buffer = Buffer.from(await result.audio.arrayBuffer());

  await mkdir(path.dirname(opts.outputPath), { recursive: true });
  await writeFile(opts.outputPath, buffer);

  return {
    mp3Path: opts.outputPath,
    wordBoundaries: result.subtitle ?? [],
  };
}

export interface VoixInfo {
  name: string;
  locale: string;
  gender: string;
  personalities: string[];
}

/**
 * Liste les voix adaptees au francais : toutes les voix FR + les voix
 * "Multilingual" (très expressives, qui s'adaptent/auto-detectent le francais).
 */
export async function listerVoixFr(): Promise<VoixInfo[]> {
  const manager = await UniversalVoicesManager.create();
  const all = manager.find({}) as unknown as Voice[];
  const selected = all.filter(
    (v) => v.Locale?.startsWith("fr") || /Multilingual/i.test(v.ShortName),
  );
  return selected
    .sort((a, b) => a.Locale.localeCompare(b.Locale) || a.ShortName.localeCompare(b.ShortName))
    .map((v) => ({
      name: v.ShortName,
      locale: v.Locale,
      gender: v.Gender,
      personalities: v.VoiceTag?.VoicePersonalities ?? [],
    }));
}
