import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { LlmProvider } from "./llm/types.js";
import { extractJson } from "./llm/openai.js";
import {
  messagesIdees,
  messagesScript,
  type IdeasResult,
  type ScriptResult,
} from "./prompts.js";
import { syntheseVoix, type VoixResult } from "./voice.js";

export interface PipelineResult {
  topic: string;
  idees: IdeasResult["idees"];
  ideaRetenue: IdeasResult["idees"][number];
  script: ScriptResult;
  voix: VoixResult;
}

/**
 * Pipeline Jalon 1 : sujet -> idees -> script -> voix.mp3
 * Ecrit aussi idees.json / script.json dans le dossier de sortie
 * pour inspection et pour le montage (Jalon 2).
 */
export async function genererShort(
  config: AppConfig,
  llm: LlmProvider,
  topic: string,
  opts?: { ideaIndex?: number },
): Promise<PipelineResult> {
  // 1) IDEES
  const ideesRaw = await llm.complete(
    messagesIdees({ topic, nIdeas: config.nIdeas, language: config.language }),
  );
  const idees = extractJson<IdeasResult>(ideesRaw).idees;
  const ideaIndex = Math.min(opts?.ideaIndex ?? 0, idees.length - 1);
  const ideaRetenue = idees[ideaIndex];

  await mkdir(config.outputDir, { recursive: true });
  await writeFile(
    path.join(config.outputDir, "idees.json"),
    JSON.stringify({ topic, idees }, null, 2),
  );

  // 2) SCRIPT
  const scriptRaw = await llm.complete(
    messagesScript({ idea: ideaRetenue.idee, language: config.language }),
  );
  const script = extractJson<ScriptResult>(scriptRaw);

  await writeFile(
    path.join(config.outputDir, "script.json"),
    JSON.stringify({ idea: ideaRetenue, script }, null, 2),
  );

  // 3) VOIX
  const mp3Path = path.join(config.outputDir, "voix.mp3");
  const voix = await syntheseVoix(script.texte_continu, {
    voice: config.edgeVoice,
    outputPath: mp3Path,
  });

  return { topic, idees, ideaRetenue, script, voix };
}
