#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { createLlm } from "./llm/index.js";
import { messagesIdees } from "./prompts.js";
import { extractJson } from "./llm/openai.js";
import { listerVoixFr } from "./voice.js";
import { genererShort } from "./pipeline.js";

const args = process.argv.slice(2);

function usage() {
  console.log(`
DANTI_CLIPER - Jalon 1 (idee -> script -> voix)

Usage:
  npm run gen -- "<sujet>"            Genere un short complet (idees + script + voix.mp3)
  npm run gen -- "<sujet>" --idee 2   Choisit l'idee n°2 parmi celles generees
  npm run gen -- --idees "<sujet>"    Affiche uniquement les idees pour ce sujet
  npm run gen -- --voix               Liste les voix FR disponibles (pour choisir)

Ex:
  npm run gen -- "pourquoi on procrastine"
  npm run gen -- --voix
`);
}

async function main() {
  const config = loadConfig();
  const llm = createLlm(config);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    usage();
    return;
  }

  // Lister les voix FR
  if (args.includes("--voix")) {
    const voix = await listerVoixFr();
    console.log(`\nVoix FR disponibles (${voix.length}) :`);
    for (const v of voix) {
      const tags = v.personalities.join(", ");
      console.log(`  - ${v.name}  [${v.gender}]${tags ? `  -- ${tags}` : ""}`);
    }
    return;
  }

  // Afficher les idees seules
  const idxVoix = args.indexOf("--idees");
  if (idxVoix >= 0) {
    const topic = args[idxVoix + 1];
    if (!topic) {
      usage();
      return;
    }
    console.log(`\nGeneration d'idees pour : "${topic}" (provider=${llm.name})\n`);
    const raw = await llm.complete(messagesIdees({ topic, nIdeas: config.nIdeas, language: config.language }));
    const { idees } = extractJson<{ idees: { sujet: string; titre: string; hook: string; fond: string }[] }>(raw);
    idees.forEach((id, i) => {
      console.log(`[${i + 1}] ${id.titre || id.sujet}`);
      console.log(`    SUJET : ${id.sujet}`);
      console.log(`    HOOK : ${id.hook}`);
      console.log(`    FOND : ${id.fond}\n`);
    });
    return;
  }

  // Pipeline complet
  const topic = args.find((a) => !a.startsWith("--")) ?? "";
  if (!topic) {
    usage();
    return;
  }

  const idx = args.indexOf("--idee");
  const ideaIndex = idx >= 0 ? Number(args[idx + 1]) : undefined;

  console.log(`\n>>> Sujet : "${topic}"  (provider=${llm.name}, voix=${config.edgeVoice})\n`);

  const res = await genererShort(config, llm, topic, { ideaIndex });

  console.log("--- IDEES GENEREES ---");
  res.idees.forEach((id, i) => console.log(`  [${i + 1}] ${id.sujet}  (hook: ${id.hook})`));
  console.log(`\n--- IDEE RETENUE [${res.idees.indexOf(res.ideaRetenue) + 1}] ---`);
  console.log(`  ${res.ideaRetenue.sujet}`);

  console.log("\n--- SCRIPT ---");
  console.log(`  Titre : ${res.script.titre}`);
  console.log(`  Hook  : ${res.script.hook}`);
  console.log(`  Duree : ${res.script.duree}`);
  console.log(`\n  Narration :\n  ${res.script.texte_continu}`);
  console.log(`\n  Fond : ${res.script.fond}`);

  console.log(`\n>>> VOIX GENEREE : ${res.voix.mp3Path}`);
  console.log(`>>> Fichiers : idees.json, script.json, voix.mp3 dans ./${config.outputDir}\n`);
}

main().catch((err) => {
  console.error("\n[Erreur]", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
