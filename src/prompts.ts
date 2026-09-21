import type { LlmMessage } from "./llm/types.js";

// ============================================================
// CULTURE GENERAL PROMPTS - structures pour la retention.
// Contrat : langue imposée par le parametre `language` (jamais
// fixée dans le prompt), durée adaptative au sujet (aucune cible
// 25-35s), pas de boucle finale obligatoire, faits honnêtes et
// vérifiables, hook qui tient la promesse du contenu réel.
// ============================================================

const COMMON_RULES = `
You are an expert copywriter for short-form science and curiosity videos (Shorts / Reels / TikTok).
Credible, precise, engaging, appealing to a broad audience.
- LANGUAGE : write in the language given in the user message ("Language : ...").
  Use ONLY that language for titre, titre_youtube, hook, narration and
  description. NEVER mix languages, never switch mid-text.

PACKAGING - TITLE, DESCRIPTION, HASHTAGS :
- titre_youtube : SEO + catchy. Front-load the main keyword, keep it under 70
  characters, no clickbait lie, no ALL-CAPS spam.
- description : 2-3 punchy sentences that hook the viewer, deliver the value,
  and end with a soft CTA ("Follow for more"). No hashtags inside the text.
- hashtags : EXACTLY 3-5 tags. Mix 1 broad discovery tag with 2-4 niche tags
  that MATCH the video topic. Never generic filler - the tags must describe
  THIS video.

STRICT NICHE - CULTURE GENERAL :
- ALLOWED TOPICS : unusual facts, surprising numbers, debunked myths, useful tips.
- FORBIDDEN : thriller, dark, controversial, supernatural, narrative fiction
  (fictional characters/places).
- Content discoverable by a broad audience, not an internal niche.

ABSOLUTE RULES (non-negotiable) :
- SAFE CONTENT : nothing illegal, dangerous, shocking, defamatory, political,
  religious, dubious health advice, or sexual. If a topic drifts toward a
  sensitive area, drop it and pick a 100% safe angle.
- HOOK in the first seconds : one sentence that stops the scroll with a number,
  a contradiction or a curiosity tension. NO "hello, today", NO lazy
  "did you know...". A single sentence, MAX 12 words.
- HONESTY : state only verifiable facts. NO invented statistics, no fake
  precision, no absolute claims you cannot back ("always", "never",
  "impossible"). If a claim is disputed or approximate, soften it explicitly.
  No clickbait lie : the hook must match what the video actually delivers.
- RETENTION : short sentences, fast rhythm, ONE strong idea per sentence, new
  information regularly, questions the viewer implicitly asks, a real payoff.
- DURATION : choose the duration the topic actually needs. Dense topics can be
  short, layered topics longer - but NEVER stretch. Budget roughly 2.5 to 4.3
  words per second. ZERO filler, ZERO digression, ZERO list-of-three decoration.
- ENDING : finish on a satisfying payoff : the answer to the hook, or a second
  surprising layer of information. Echoing the hook is allowed when natural,
  never forced, never a gimmick.
- Reply ONLY with valid JSON, no text around it.
`;

// ------------------------------------------------------------
// 1) IDEA GENERATION
// ------------------------------------------------------------
export interface Idear {
  sujet: string; // the fact / concept of the video (one sentence)
  titre: string; // catchy video title
  hook: string; // hook sentence for the first seconds
  angle: string; // curiosite | chiffre | contraire | mythe | astuce
  fond: string; // short description of the background visual
}

export interface IdeasResult {
  idees: Idear[];
}

export function messagesIdees(opts: {
  topic: string;
  nIdeas: number;
  language?: string;
  usedTopics?: string[];
}): LlmMessage[] {
  const { topic, nIdeas, language = "en", usedTopics = [] } = opts;
  const hasTopic = topic.trim().length > 0;

  const system = COMMON_RULES +
    `\nProvide exactly ${nIdeas} COMPLETELY DIFFERENT CULTURE GENERAL TOPICS.
Each topic must have a high discovery potential : an unusual fact, a surprising
number, a myth to debunk, or a useful tip. Choose facts LITTLE KNOWN to the
general public WITH a real verifiable number. FORBIDDEN overused and beaten
topics (Eiffel Tower, eternal honey, three-heart octopus, bees' dance, lightning
hotter than the sun, horned vikings, ant, penguin, brain/stars...). Forbid
thriller/dark approaches. If a topic is given as a direction, get inspired by it
but vary. Each idea must be THE most surprising and the least seen possible.
Choose facts that trigger the "I didn't know that" or "that's impossible" : the
viewer must want to share or comment. Prefer a SECOND-LEVEL angle : the
surprising mechanism or consequence behind a fact, not just the bare fact.
Avoid bland facts, obvious tips and things everyone already knows.`;
  const directive = hasTopic
    ? `Direction / general theme (optional, get inspired by it) : "${topic}"`
    : `No imposed topic : invent freely.`;
  const banned = usedTopics.length > 0
    ? `\nALREADY USED TOPICS (STRICTLY FORBIDDEN, do not reuse them even rephrased) :\n${usedTopics.map((t) => `- ${t}`).join("\n")}`
    : "";

  const user = `${directive}${banned}
Language : ${language}
Reply with this exact JSON schema :
{
  "idees": [
    { "sujet": "the fact / concept in one sentence",
      "titre": "catchy title that makes people click",
      "hook": "THE HOOK (one sentence, max 12 words) : a number, a contradiction or a curiosity tension that stops the scroll",
      "angle": "curiosite | chiffre | contraire | mythe | astuce",
      "fond": "short description of the ideal background visual (1 sentence)" }
  ]
}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ------------------------------------------------------------
// 2) SCRIPT GENERATION
// ------------------------------------------------------------
export interface ScriptPart {
  partie: "hook" | "corps" | "preuve" | "chute" | "cta";
  texte: string;
  duree: string; // ex "3s"
}

export interface ScriptResult {
  titre: string;
  /** YouTube-optimized title (max 100 chars), rephrased from the hook. */
  titre_youtube: string;
  hook: string;
  duree: string;
  texte_continu: string; // full narration passed to TTS
  structure: ScriptPart[];
  fond: string;
  /** Video description without hashtags (for YouTube). */
  description: string;
  /** List of keywords (without #) for hashtags + YouTube tags. */
  hashtags: string[];
}

export function messagesScript(opts: {
  idea: string;
  language?: string;
  /** Hook selectionne par le Hook Engine (le script DOIT commencer par cette phrase exacte). */
  hook?: string;
  /** Corrections du fact-check a respecter imperativement. */
  feedback?: string;
}): LlmMessage[] {
  const { idea, language = "en", hook, feedback } = opts;

  const fixedHook = hook?.trim()
    ? `\nFIXED HOOK (from the hook engine) : "${hook.trim()}".
texte_continu MUST start with this EXACT sentence, verbatim, no rephrasing.`
    : "";
  const corrections = feedback?.trim()
    ? `\nCORRECTIONS REQUIRED BY FACT-CHECK (non-negotiable) :\n${feedback.trim()}\nFix these issues in the narration. Never repeat a contested claim.`
    : "";

  const system = COMMON_RULES +
    `\nTurn the idea into a complete short-video script, ready to be read as voiceover.
Structure (adapt the timing to the topic - NO fixed total duration) :
- HOOK (first seconds) : the sentence that stops the scroll. THE most important
  part. It states the tension or the question the video will resolve, and it
  must match what the video actually delivers.
- BODY : the fact, explained with one strong idea per sentence.
- PROOF : a number, a comparison or an example that validates the hook.
- ENDING : a satisfying payoff (the answer to the hook, or a second surprising
  layer of information).
- CTA (optional, MAX 2s) : ONE short sentence ("Subscribe"). Place it BEFORE the
  ending, NEVER after - the last thing heard must be the ending.
texte_continu STARTS with the exact hook sentence, then flows, and ENDS with the
ending. Choose the duration the topic actually needs - NEVER stretch with filler.${fixedHook}${corrections}`;

  const user = `Idea to develop : "${idea}"
Language : ${language}
Reply with this exact JSON schema :
{
  "titre": "short punchy title (internal use)",
  "titre_youtube": "YouTube-optimized title : catchy, SEO, rephrased from the hook, maximum 100 characters",
  "hook": "THE HOOK alone (one sentence, max 12 words) : a number, a contradiction or a curiosity tension that stops the scroll",
  "duree": "estimated narration duration of YOUR script (any length the topic needs), ex \\"18s\\"",
  "texte_continu": "the COMPLETE narration in one paragraph, ready for speech synthesis. STARTS with the EXACT hook sentence, then flows (body, proof), and ENDS with the ending (the payoff)",
  "structure": [
    { "partie": "hook",   "texte": "...", "duree": "3s" },
    { "partie": "corps",  "texte": "...", "duree": "12s" },
    { "partie": "preuve", "texte": "...", "duree": "9s" },
    { "partie": "chute",  "texte": "...", "duree": "5s" }
  ],
  "fond": "description of the ideal background for this video (1 sentence)",
  "description": "video description for YouTube : 2-3 engaging sentences that summarize the video and reuse the hook tension, without hashtags",
  "hashtags": ["3-5", "short", "keywords", "without", "#", "relevant", "for", "the", "niche"]
}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ------------------------------------------------------------
// 3) Pexels image search queries per segment
// ------------------------------------------------------------
const IMAGE_RULES = `
You turn a narration sentence into ONE precise Pexels (photo stock) search query.
You write in English. The goal is a PHOTO THAT MATCHES the sentence.
The query MUST name a CONCRETE, PHOTOGRAPHABLE subject : a real object, animal,
plant, place, body part, organ, material, food or scene a camera could capture.
Rules :
- 2 to 5 words. The concrete noun(s) FIRST. Ex : "flamingo", "human brain",
  "venus planet", "shrimp", "blood vessels", "dna helix", "viking helmet".
- FORBIDDEN : abstract concepts (pigment, rotation, energy, process, time,
  memory), verbs, bare adjectives, numbers, and generic filler ("concept",
  "science", "idea", "thing", "background", "nature" alone, "abstract").
- If the sentence is abstract, name the MOST CONCRETE real thing it is about
  (the object, animal, place, organ or material behind the idea).
- Stay in the video theme (use the main subject as context when useful).
- IGNORE negations : "never existed" => the photo of the thing talked about
  ("viking helmet"), never "no helmet".
- ONE subject per query. Never two different subjects.
- No filler words, no "a/an/the", no isolated numbers.
- If the sentence is a call to action or has nothing visual, return the main
  video subject as the query.
`;

export function messagesImageQueries(opts: {
  subject: string;
  segments: string[];
  language?: string;
}): LlmMessage[] {
  const { subject, segments, language = "en" } = opts;
  const numbered = segments.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const user = `Video subject : "${subject}"
Language : ${language}

Here are the narration segments (in order). For EACH one, provide a short
Pexels query (2-6 words), concrete and visual, focused on the element the
sentence talks about, in the context of the subject.

${numbered}

Reply ONLY with this exact JSON :
{ "queries": ["segment 1 query", "segment 2 query", ...] }`;

  return [
    { role: "system", content: IMAGE_RULES },
    { role: "user", content: user },
  ];
}