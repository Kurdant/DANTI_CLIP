import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  UniversalEdgeTTS,
  UniversalVoicesManager,
  type Voice,
  type WordBoundary,
} from "edge-tts-universal";
import * as speechsdk from "microsoft-cognitiveservices-speech-sdk";

export interface VoixResult {
  mp3Path: string;
  /** Timings par mot (en centaines de nanosecondes) - utilises pour le karaoke. */
  wordBoundaries: WordBoundary[];
}

/** Echappe le texte pour le SSML (caracteres speciaux XML). */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** SSML Azure : voix + prosodie (rate/pitch). */
function buildSsml(text: string, voice: string, rate: string, pitch: string): string {
  const lang = voice.split("-").slice(0, 2).join("-") || "en-US";
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${voice}"><prosody rate="${rate}" pitch="${pitch}">${escapeXml(text)}</prosody></voice>` +
    `</speak>`
  );
}

/**
 * Synthese via Azure AI Speech (licence commerciale, DPA, region au choix).
 * Les word boundaries viennent du SDK (meme format 100ns que Edge TTS).
 */
async function syntheseAzure(
  texte: string,
  opts: { voice: string; outputPath: string; rate?: string; pitch?: string },
  key: string,
  region: string,
): Promise<VoixResult> {
  const speechConfig = speechsdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = opts.voice;
  speechConfig.speechSynthesisOutputFormat =
    speechsdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

  const synthesizer = new speechsdk.SpeechSynthesizer(speechConfig);
  const wordBoundaries: WordBoundary[] = [];
  synthesizer.wordBoundary = (_sender, e) => {
    wordBoundaries.push({ offset: e.audioOffset, duration: e.duration, text: e.text });
  };

  const ssml = buildSsml(texte, opts.voice, opts.rate ?? "+0%", opts.pitch ?? "+0Hz");
  const result = await new Promise<speechsdk.SpeechSynthesisResult>((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (r) => {
        synthesizer.close();
        resolve(r);
      },
      (err) => {
        synthesizer.close();
        reject(new Error(String(err)));
      },
    );
  });

  if (result.reason !== speechsdk.ResultReason.SynthesizingAudioCompleted) {
    throw new Error(`Azure TTS: ${result.errorDetails ?? result.reason}`);
  }

  const buffer = Buffer.from(result.audioData);
  await mkdir(path.dirname(opts.outputPath), { recursive: true });
  await writeFile(opts.outputPath, buffer);
  return { mp3Path: opts.outputPath, wordBoundaries };
}

/** Convertit "+12%" en 1.12 (speakingRate Google). */
function parseGoogleRate(rate?: string): number {
  if (!rate) return 1.0;
  const m = /([+-]?\d+)%/.exec(rate);
  if (!m) return 1.0;
  const pct = Number(m[1]);
  return Math.min(4, Math.max(0.25, 1 + pct / 100));
}

/** SSML Google avec un mark avant chaque mot (pour recuperer les timings). */
function buildGoogleSsml(text: string, voice: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const marked = words.map((w, i) => `<mark name="w${i}"/>${escapeXml(w)}`).join(" ");
  const lang = voice.split("-").slice(0, 2).join("-") || "en-US";
  return `<speak version="1.0" xml:lang="${lang}">${marked}</speak>`;
}

/**
 * Synthese via Google Cloud Text-to-Speech (cle API).
 * Les timings mot-a-mot viennent des SSML marks (enableTimePointing).
 */
async function syntheseGoogle(
  texte: string,
  opts: { voice: string; outputPath: string; rate?: string; pitch?: string },
  apiKey: string,
  defaultVoice: string,
): Promise<VoixResult> {
  const words = texte.split(/\s+/).filter(Boolean);
  // La voix choisie dans l'UI vient de la liste Edge : si ce n'est pas une voix
  // Google, on retombe sur la voix Google par defaut (GOOGLE_TTS_VOICE).
  const isGoogleVoice = /(Neural2|Studio|WaveNet|Standard|Chirp|Polyglot|News|Casual|Journey)/i.test(opts.voice);
  const voice = isGoogleVoice ? opts.voice : defaultVoice;
  const lang = voice.split("-").slice(0, 2).join("-") || "en-US";

  const body = {
    input: { ssml: buildGoogleSsml(texte, voice) },
    voice: { languageCode: lang, name: voice },
    audioConfig: { audioEncoding: "MP3", speakingRate: parseGoogleRate(opts.rate) },
    enableTimePointing: ["SSML_MARK"],
  };

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google TTS ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    audioContent?: string;
    timepoints?: { markName?: string; timeSeconds?: number }[];
  };
  if (!data.audioContent) throw new Error("Google TTS: reponse sans audio");

  const buffer = Buffer.from(data.audioContent, "base64");
  await mkdir(path.dirname(opts.outputPath), { recursive: true });
  await writeFile(opts.outputPath, buffer);

  // Un mark par mot -> word boundaries au format 100ns (comme Edge/Azure).
  const times = new Map<string, number>();
  for (const t of data.timepoints ?? []) {
    if (t.markName) times.set(t.markName, Number(t.timeSeconds ?? 0));
  }
  const NS = 10_000_000;
  const wordBoundaries: WordBoundary[] = words.map((w, i) => {
    const start = times.get(`w${i}`) ?? (i > 0 ? times.get(`w${i - 1}`) ?? 0 : 0);
    const next = i + 1 < words.length ? times.get(`w${i + 1}`) : undefined;
    const dur = next != null ? Math.max(0.05, next - start) : 0.3;
    return { offset: Math.round(start * NS), duration: Math.round(dur * NS), text: w };
  });

  return { mp3Path: opts.outputPath, wordBoundaries };
}

/**
 * Synthetise la voix d'un texte en MP3.
 * Priorite : Google Cloud TTS (GOOGLE_TTS_API_KEY) > Azure AI Speech
 * (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION) > Edge TTS (fallback dev).
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
  const googleKey = process.env.GOOGLE_TTS_API_KEY;
  if (googleKey) {
    return syntheseGoogle(texte, opts, googleKey, process.env.GOOGLE_TTS_VOICE || "en-US-Neural2-D");
  }

  const azureKey = process.env.AZURE_SPEECH_KEY;
  const azureRegion = process.env.AZURE_SPEECH_REGION;
  if (azureKey && azureRegion) {
    return syntheseAzure(texte, opts, azureKey, azureRegion);
  }

  // Fallback dev : Edge TTS (non licencie pour un usage commercial).
  const tts = new UniversalEdgeTTS(texte, opts.voice, {
    rate: opts.rate ?? "+12%", // energie : legerement plus rapide pour un ton dynamique
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
 * Liste les voix adaptees a une langue : toutes les voix de la locale + les voix
 * "Multilingual" (très expressives, qui s'adaptent/auto-detectent la langue).
 */
export async function listerVoix(lang: string = "en"): Promise<VoixInfo[]> {
  const manager = await UniversalVoicesManager.create();
  const all = manager.find({}) as unknown as Voice[];
  const selected = all.filter(
    (v) => v.Locale?.toLowerCase().startsWith(lang.toLowerCase()) || /Multilingual/i.test(v.ShortName),
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