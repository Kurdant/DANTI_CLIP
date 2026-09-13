import { spawn } from "node:child_process";

/** Media d'illustration (image fixe ou clip video) a incruster dans le montage (piste B). */
export interface PartImage {
  /** Nom de fichier dans renderDir (ex: "part_0.jpg" ou "part_0.mp4"). */
  file: string;
  /** Debut (s) dans la video. */
  start: number;
  /** Fin (s) dans la video. */
  end: number;
  /** Type de media : image fixe (defaut) ou clip video. */
  kind?: "image" | "video";
}

export interface MontageOptions {
  renderDir: string;
  bgVideoAbs: string | null;
  audioAbs: string;
  subsFile: string;
  outName: string;
  /** Duree attendue (s) pour calculer la progression du rendu. */
  expectedDuration?: number;
  /** Angle du sujet (curiosite/chiffre/contraire/mythe/astuce) => couleur du fond degrade. */
  angle?: string;
  /** Medias d'illustration en sequence (remplacent le fond degrade/video). */
  images?: PartImage[];
  /** Mascotte (PNG fond transparent) incrustee en bas. */
  mascot?: string | null;
  /** Musique de fond (chemin absolu), bouclee et duckee sous la voix. */
  musicAbs?: string | null;
  /** Volume de la musique (0..1). Defaut 0.35. */
  musicVolume?: number;
  /** Effets dynamiques : zoom/pan (Ken Burns) + fondus. Defaut true. */
  effects?: boolean;
  /** Fichier ASS du gros hook plein ecran (brûle par-dessus les sous-titres). */
  hookFile?: string | null;
  /** Fin (s) de l'intro "test" : mascotte agrandie jusqu'a cet instant, puis taille normale. */
  mascotIntroEnd?: number | null;
  /** Hauteur (px) de la mascotte agrandie pendant l'intro. Defaut 1040. */
  mascotIntroH?: number;
  /** Sound effects positionnes dans le temps (ms). */
  sfx?: { file: string; atMs: number; volume: number }[];
}

const W = 1080;
const H = 1920;

/**
 * 8 palettes de degrade predefinies (couleur 1 -> couleur 2). Une est tiree au
 * hasard a chaque rendu video (lorsqu'aucun fond video n'est choisi). Tons
 * sombres pour garder une bonne lisibilite des sous-titres.
 */
const FOND_GRADIENTS: [string, string][] = [
  ["0x0b1f3a", "0x050d1a"], // bleu nuit
  ["0x2a1245", "0x12051f"], // violet profond
  ["0x064e3b", "0x022c22"], // vert emeraude
  ["0x6b0f1a", "0x2b0608"], // rouge bordeaux
  ["0x7a3d1f", "0x38160a"], // orange brun
  ["0x0b4f6b", "0x04222b"], // cyan profond
  ["0x5b2b5b", "0x1f0e1f"], // rose violet
  ["0x26303a", "0x11161c"], // gris anthracite
];

/**
 * Assemble fond + medias + sous-titres + voix (+ musique) => MP4 9:16.
 * Spawn ffmpeg (cwd = renderDir pour eviter l'echappement du filtre subtitles),
 * et reporte la progression (0..1) en parsant la sortie `time=`.
 */
// Vignette de media (au centre) : portrait 2:3, centree, plus grande pour marquer le visuel.
const IMG_W = 480;
const IMG_H = 720;
// Image illustrant le sujet DANS LA MOITIE HAUTE ; le texte est en bas,
// pres de la mascotte (comme si elle parlait).
const IMG_X = Math.round((W - IMG_W) / 2);
const IMG_Y = 110;

// Mascotte (en bas, surlevee) : laisse de l'espace en bas pour le titre/description
// YouTube, sans coller le personnage au bord. Hauteur fixe, largeur auto (aspect).
const MASCOT_H = 360;
const MASCOT_BOTTOM_GAP = 210;
const MASCOT_Y = H - MASCOT_BOTTOM_GAP - MASCOT_H;

/** Duree des fondus d'apparition/disparition des medias (s). Plus court = demarrage plus percutant. */
const MEDIA_FADE = 0.25;
/** Amplitude du zoom Ken Burns (1.0 -> 1.12). */
const ZOOM_MAX = 1.12;

export async function rendreVideo(opts: MontageOptions, onProgress?: (fraction: number) => void): Promise<void> {
  const { renderDir, bgVideoAbs, audioAbs, subsFile, outName, expectedDuration, images, mascot } = opts;
  const useEffects = opts.effects !== false;
  const subs = subsFile.replace(/\\/g, "/");
  const filterScale = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;

  const args: string[] = ["-y"];
  const parts: string[] = [];
  const imgCount = images?.length ?? 0;

  // Fond plein cadre (input 0) : video ou degrade aleatoire selon l'angle.
  if (bgVideoAbs) {
    args.push("-stream_loop", "-1", "-i", bgVideoAbs);
    parts.push(`[0:v]${filterScale},format=yuv420p[bg]`);
  } else {
    const pal = FOND_GRADIENTS[Math.floor(Math.random() * FOND_GRADIENTS.length)];
    args.push("-f", "lavfi", "-i", `gradients=s=${W}x${H}:c0=${pal[0]}:c1=${pal[1]}:type=radial:speed=0.03:rate=30`);
    parts.push(`[0:v]format=yuv420p[bg]`);
  }

  let prev = "bg";

  // Medias d'illustration (inputs 1..N) : image fixe ou clip video, chacun dans sa fenetre.
  if (imgCount > 0) {
    images!.forEach((im) => {
      const d = Math.max(1, im.end - im.start + 0.5);
      if (im.kind === "video") {
        args.push("-stream_loop", "-1", "-t", String(d), "-i", im.file);
      } else {
        args.push("-framerate", "30", "-loop", "1", "-t", String(d), "-i", im.file);
      }
    });
    images!.forEach((im, i) => {
      const d = Math.max(1, im.end - im.start + 0.5);
      const out = `o${i}`;
      let chain: string;
      if (im.kind === "video") {
        // Clip video : recadre, pas de zoom (v1).
        chain = `[${i + 1}:v]scale=${IMG_W}:${IMG_H}:force_original_aspect_ratio=increase,crop=${IMG_W}:${IMG_H},fps=30,trim=duration=${d},setpts=PTS-STARTPTS`;
      } else if (useEffects) {
        // Ken Burns : zoom lent (alternance avant/arriere), upscale 2x avant zoompan.
        const step = (ZOOM_MAX - 1) / (30 * d);
        const z = i % 2 === 0 ? `min(zoom+${step.toFixed(6)},${ZOOM_MAX})` : `if(lte(on,1),${ZOOM_MAX},max(zoom-${step.toFixed(6)},1.0))`;
        chain =
          `[${i + 1}:v]scale=${IMG_W * 2}:${IMG_H * 2}:force_original_aspect_ratio=increase,crop=${IMG_W * 2}:${IMG_H * 2},` +
          `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${IMG_W}x${IMG_H}:fps=30,` +
          `trim=duration=${d},setpts=PTS-STARTPTS`;
      } else {
        chain = `[${i + 1}:v]scale=${IMG_W}:${IMG_H}:force_original_aspect_ratio=increase,crop=${IMG_W}:${IMG_H},fps=30,trim=duration=${d},setpts=PTS-STARTPTS`;
      }
      if (useEffects) {
        // Fondus d'apparition/disparition (transitions douces entre plans).
        const fadeOut = Math.max(0, d - MEDIA_FADE).toFixed(2);
        chain += `,format=yuva420p,fade=t=in:st=0:d=${MEDIA_FADE}:alpha=1,fade=t=out:st=${fadeOut}:d=${MEDIA_FADE}:alpha=1`;
      }
      // Decale le media a son vrai debut dans la timeline globale.
      chain += `,setpts=PTS+${im.start}/TB[v${i}]`;
      parts.push(chain);
      parts.push(`[${prev}][v${i}]overlay=${IMG_X}:${IMG_Y}:enable='between(t,${im.start},${(im.end + 0.5).toFixed(2)})':format=auto[${out}]`);
      prev = out;
    });
  }

  let nextIdx = 1 + imgCount;

  // Mascotte (input suivant) : personnage en bas, surleve, toujours visible.
  // Intro "test" : agrandie pendant le hook, puis retour a sa place d'origine.
  if (mascot) {
    const mIdx = nextIdx++;
    const mDur = Math.max(1, expectedDuration ?? 120);
    args.push("-framerate", "30", "-loop", "1", "-t", String(mDur), "-i", mascot);
    const introEnd = opts.mascotIntroEnd && opts.mascotIntroEnd > 0 ? opts.mascotIntroEnd : null;
    if (introEnd) {
      const bigH = opts.mascotIntroH ?? 1040;
      const bigY = H - bigH - 120;
      const cut = introEnd.toFixed(2);
      parts.push(`[${mIdx}:v]split=2[msA][msB]`);
      parts.push(`[msA]scale=-2:${bigH}[bigv]`);
      parts.push(`[msB]scale=-2:${MASCOT_H}[smallv]`);
      parts.push(`[${prev}][bigv]overlay=(W-w)/2:${bigY}:enable='lt(t,${cut})'[bigm]`);
      parts.push(`[bigm][smallv]overlay=(W-w)/2:${MASCOT_Y}:enable='gte(t,${cut})'[mascot]`);
    } else {
      parts.push(`[${mIdx}:v]scale=-2:${MASCOT_H}[mascotv]`);
      parts.push(`[${prev}][mascotv]overlay=(W-w)/2:${MASCOT_Y}[mascot]`);
    }
    prev = "mascot";
  }

  // Sous-titres par-dessus (yuv420p requis par libass). Le gros hook passe au-dessus.
  parts.push(`[${prev}]format=yuv420p[base]`);
  if (opts.hookFile) {
    parts.push(`[base]subtitles=${subs}[s1]`);
    parts.push(`[s1]subtitles=${opts.hookFile.replace(/\\/g, "/")}[v]`);
  } else {
    parts.push(`[base]subtitles=${subs}[v]`);
  }

  // Audio : voix (obligatoire) + musique optionnelle duckee + sound effects.
  const voiceIdx = nextIdx++;
  args.push("-i", audioAbs);
  let audioMap = `${voiceIdx}:a`;
  const sfxList = opts.sfx ?? [];

  // Base : voix seule, ou voix + musique duckee sous la voix.
  if (opts.musicAbs) {
    const musicIdx = nextIdx++;
    const vol = Math.max(0, Math.min(1, opts.musicVolume ?? 0.35));
    args.push("-stream_loop", "-1", "-i", opts.musicAbs);
    // aformat identique des deux cotes (voix 24 kHz mono vs musique 44,1 kHz stereo).
    parts.push(`[${voiceIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[voix][sc]`);
    parts.push(`[${musicIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${vol}[mus]`);
    parts.push(`[mus][sc]sidechaincompress=threshold=0.05:ratio=10:attack=15:release=350[musduck]`);
    parts.push(`[voix][musduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[base]`);
  } else {
    parts.push(`[${voiceIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[base]`);
  }

  // Sound effects : un input par effet, place dans le temps (adelay), puis mix.
  if (sfxList.length > 0) {
    const mixInputs: string[] = ["[base]"];
    sfxList.forEach((s, i) => {
      const idx = nextIdx++;
      const ms = Math.max(0, Math.round(s.atMs));
      const vol = Math.max(0, Math.min(1, s.volume));
      args.push("-t", "3", "-i", s.file);
      parts.push(`[${idx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${vol},adelay=${ms}|${ms}[sfx${i}]`);
      mixInputs.push(`[sfx${i}]`);
    });
    parts.push(`${mixInputs.join("")}amix=inputs=${sfxList.length + 1}:duration=first:dropout_transition=0:normalize=0[aout]`);
    audioMap = "[aout]";
  }

  const filter = parts.join(";");
  args.push("-filter_complex", filter);
  args.push("-map", "[v]", "-map", audioMap, "-shortest");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outName);

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { cwd: renderDir });
    const lastEmit = { value: -1 };

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const m = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (!m) return;
      const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 100;
      if (expectedDuration && onProgress) {
        const frac = Math.min(1, sec / expectedDuration);
        if (frac - lastEmit.value > 0.005 || frac >= 1) {
          lastEmit.value = frac;
          onProgress(frac);
        }
      }
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("ffmpeg a echoue (code " + code + ")"));
    });
  });
}
