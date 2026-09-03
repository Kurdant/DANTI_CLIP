import type { LlmMessage } from "./llm/types.js";

// ============================================================
// PROMPTS STICTS - le coeur de la qualite du contenu.
// Objectifs (demande Hugo) :
//  - sujets libres mais AUCUN debordement (contenu sur/safe)
//  - contenu ACCROCHEUR, qui fait des vues, HOOK fort qui maintient
//  - ton legerement drole, format Shorts (30-45s)
//  - retour STRICTEMENT au format JSON (le pipeline s'appuie dessus)
// ============================================================

const REGLES_COMMUNES = `
Tu es un expert en copywriting pour videos courtes virales (Shorts / Reels / TikTok).
Tu ecris en francais, ton engageant et legerement drole, mais credible.

REGLES ABSOLUES (non negociables) :
- CONTENU SANS DEBORDEMENT : rien d'illegal, dangereux, choquant, diffamatoire,
  politique, religieux, sanitaire douteux, ou a caractere sexuel. Si un sujet
  glisse vers une zone sensible, ecarte-le et propose un angle 100% safe.
- Accroche : le HOOK (1-3 premieres secondes) doit creer de la curiosite ou un
  contraste qui donne envie de rester. Pas de "Bonjour, aujourd'hui...".
- Retention : phrases courtes, rythme rapide, une seule idee forte par phrase.
- Format court : 30 a 45 secondes de narration au total.
- ZERO remplissage, ZERO digression, ZERO langage robotique.
- Reponds UNIQUEMENT avec du JSON valide, sans texte autour.
`;

// ------------------------------------------------------------
// 1) Generation d'IDEES
// ------------------------------------------------------------
export interface Idear {
  idee: string;
  hook: string;
  angle: "curiosite" | "contraire" | "astuce" | "histoire" | "chiffre" | "controverse-safe";
  fond: string; // description du fond/visuel a afficher (utilise par le montage)
}

export interface IdeasResult {
  idees: Idear[];
}

export function messagesIdees(opts: {
  topic: string;
  nIdeas: number;
  language?: string;
}): LlmMessage[] {
  const { topic, nIdeas, language = "fr" } = opts;

  const system = REGLES_COMMUNES +
    `\nFournis exactement ${nIdeas} idees de videos courtes et virales.
Chaque idee doit : avoir un angle fort, un hook qui accroche en 1 seconde,
et etre un sujet qui IMPACTE / intrigue / fait reflechir sans jamais deborder.
Le champ "fond" decrit le visuel de fond (image, ecran, gameplay, animation) en 1 phrase.`;

  const user = `Sujet / theme : "${topic}"
Langue : ${language}
Reponds avec ce schema JSON exact :
{
  "idees": [
    { "idee": "titre clair de la video",
      "hook": "phrase d'accroche des 3 premieres secondes",
      "angle": "curiosite | contraire | astuce | histoire | chiffre | controverse-safe",
      "fond": "description du visuel de fond en 1 phrase courte" }
  ]
}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ------------------------------------------------------------
// 2) Generation du SCRIPT
// ------------------------------------------------------------
export interface ScriptPart {
  partie: "hook" | "corps" | "preuve" | "cta";
  texte: string;
  duree: string; // ex "3s"
}

export interface ScriptResult {
  titre: string;
  hook: string;
  duree: string;
  texte_continu: string; // narration complete a passer a la TTS
  structure: ScriptPart[];
  fond: string;
}

export function messagesScript(opts: {
  idea: string;
  language?: string;
}): LlmMessage[] {
  const { idea, language = "fr" } = opts;

  const system = REGLES_COMMUNES +
    `\nTransforme l'idee en script complet de video courte, pret a etre lu en voix off.
Le HOOK est la part la plus importante : il doit bloquer le scroll dans les 2 premieres secondes.
Construis une progression : HOOK (curiosite) -> CORPS (valeur / info) -> PREUVE (exemple ou punchline) -> CTA (abonnement / commentaire).
Ajoute une touche d'humour legere mais sans tomber dans le vulgaire.`;

  const user = `Idee a developper : "${idea}"
Langue : ${language}
Reponds avec ce schema JSON exact :
{
  "titre": "titre court et percutant",
  "hook": "la phrase d'accroche seule (les 2-3 premieres secondes)",
  "duree": "duree approximative de la narration, ex \"35s\"",
  "texte_continu": "la narration COMPLETE en un seul paragraphe, prete pour la synthese vocale (sans indications de jeu ni de scene)",
  "structure": [
    { "partie": "hook",   "texte": "...", "duree": "3s" },
    { "partie": "corps",  "texte": "...", "duree": "12s" },
    { "partie": "preuve", "texte": "...", "duree": "12s" },
    { "partie": "cta",    "texte": "...", "duree": "6s" }
  ],
  "fond": "description du fond ideal pour cette video en 1 phrase"
}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
