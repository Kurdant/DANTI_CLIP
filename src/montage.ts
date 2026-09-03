import { spawn } from "node:child_process";

export interface MontageOptions {
  renderDir: string;
  bgVideoAbs: string | null;
  audioAbs: string;
  subsFile: string;
  outName: string;
  /** Duree attendue (s) pour calculer la progression du rendu. */
  expectedDuration?: number;
}

const W = 1080;
const H = 1920;

/**
 * Assemble fond + sous-titres ASS + voix => MP4 9:16.
 * Spawn ffmpeg (cwd = renderDir pour eviter l'echappement du filtre subtitles),
 * et reporte la progression (0..1) en parsant la sortie `time=`.
 */
export async function rendreVideo(opts: MontageOptions, onProgress?: (fraction: number) => void): Promise<void> {
  const { renderDir, bgVideoAbs, audioAbs, subsFile, outName, expectedDuration } = opts;
  const subs = subsFile.replace(/\\/g, "/");
  const filterScale = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;

  const args: string[] = ["-y"];
  if (bgVideoAbs) {
    args.push("-stream_loop", "-1", "-i", bgVideoAbs);
    args.push("-filter_complex", `[0:v]${filterScale},subtitles=${subs}[v]`);
  } else {
    args.push("-f", "lavfi", "-i", `color=c=0x171e2e:s=${W}x${H}:r=30`);
    args.push("-filter_complex", `[0:v]subtitles=${subs}[v]`);
  }
  args.push("-i", audioAbs);
  args.push("-map", "[v]", "-map", "1:a", "-shortest");
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
