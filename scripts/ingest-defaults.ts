import fs from "node:fs";
import path from "node:path";
import { loadServerEnv } from "../server/src/lib/env.ts";
import { normalizeBackground, safeUploadName, validateUpload } from "../server/src/lib/videoprocess.ts";

/**
 * Ingestion automatique de fonds video par defaut (partages par tous les users).
 *
 * Usage :
 *   npm run ingest:defaults              -> traite inbox/backgrounds une fois
 *   npm run ingest:watch                 -> surveille inbox/backgrounds (toutes les 3 s)
 *   npm run ingest:defaults -- <dossier> -> autre dossier source
 *
 * Chaque .mp4 valide est normalise (1080x1920) puis place dans assets/backgrounds.
 * Le fichier source est supprime apres succes. Les fichiers invalides restent en place.
 */

const WATCH_INTERVAL_MS = 3000;

async function ingestOne(src: string, destDir: string): Promise<{ ok: boolean; message: string }> {
  const invalid = await validateUpload(src);
  if (invalid) return { ok: false, message: invalid };
  const dest = path.join(destDir, safeUploadName(destDir, path.basename(src)));
  try {
    await normalizeBackground(src, dest);
  } catch {
    return { ok: false, message: "Echec de normalisation (fichier corrompu ?)" };
  }
  fs.rmSync(src, { force: true });
  return { ok: true, message: "ingere -> " + path.basename(dest) };
}

async function scan(srcDir: string, destDir: string): Promise<void> {
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(destDir, { recursive: true });
  const files = fs.readdirSync(srcDir).filter((f) => /\.mp4$/i.test(f));
  for (const f of files.sort()) {
    const res = await ingestOne(path.join(srcDir, f), destDir);
    const tag = res.ok ? "[OK]" : "[SKIP]";
    console.log(`${tag} ${f} — ${res.message}`);
  }
}

async function main(): Promise<void> {
  const env = loadServerEnv();
  const args = process.argv.slice(2);
  const watch = args.includes("--watch");
  const folderArg = args.find((a) => !a.startsWith("--"));
  const srcDir = path.resolve(folderArg ?? "inbox/backgrounds");
  const destDir = path.resolve(env.backgroundsDir);

  console.log(`[ingest] source : ${srcDir}`);
  console.log(`[ingest] destination (fonds par defaut) : ${destDir}`);
  await scan(srcDir, destDir);

  if (!watch) return;
  console.log(`[ingest] surveillance active (toutes les ${WATCH_INTERVAL_MS / 1000}s)…`);
  setInterval(() => scan(srcDir, destDir).catch((e) => console.error("[ingest] erreur", e)), WATCH_INTERVAL_MS);
}

main().catch((e) => {
  console.error("[ingest] erreur fatale", e);
  process.exitCode = 1;
});
