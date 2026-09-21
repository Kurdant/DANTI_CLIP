import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { rendreVideo } from "../src/montage.ts";

const MINIMAL_ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,10,10,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Test caption
`;

test("rendu video sans SFX : le graphe audio doit etre valide", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "danti-montage-"));
  const audioAbs = path.join(dir, "voix.mp3");
  const outAbs = path.join(dir, "out.mp4");

  // Voix synthetique 2 s (aucun fournisseur externe, aucun frais).
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-y", audioAbs]);
  await writeFile(path.join(dir, "caps.ass"), MINIMAL_ASS, "utf8");

  await rendreVideo({
    renderDir: dir,
    bgVideoAbs: null,
    audioAbs,
    subsFile: "caps.ass",
    outName: "out.mp4",
    expectedDuration: 2,
    // sfx absent : cas du bug (sortie audio [base] non connectee).
  });

  const out = execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", outAbs], { encoding: "utf8" });
  const duration = Number(JSON.parse(out).format.duration);
  assert.ok(Number.isFinite(duration) && duration > 0.5, `video produite invalide (duration=${duration})`);
});
