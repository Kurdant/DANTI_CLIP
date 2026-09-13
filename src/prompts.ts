import type { LlmMessage } from "./llm/types.js";

// ============================================================
// CULTURE GENERAL PROMPTS - optimized for Shorts retention.
// Goals :
//  - high-discovery topics (unusual fact, number, debunked myth,
//    useful tip) - 100% safe
//  - UNIVERSAL HOOK in the 1-2nd second (English content)
//  - LOCKED duration 25-35s (word budget) - the retention rule
//  - LOOP : the ending echoes the hook to trigger rewatch
//  - optional short CTA, NEVER after the ending (keeps the loop)
// ============================================================

const COMMON_RULES = `
You are an expert copywriter for viral short videos (Shorts / Reels / TikTok).
You write in ENGLISH, engaging tone, credible, appealing to a broad audience.
- SINGLE LANGUAGE ENGLISH : the title, title_youtube, hook, narration body and
  description are ALWAYS in English. NEVER a word, title or sentence in another
  language, even mixed. If you hesitate, translate into English.

PACKAGING - TITLE, DESCRIPTION, HASHTAGS :
- titre_youtube : SEO + catchy. Front-load the main keyword, keep it under 70
  characters, no clickbait lie, no ALL-CAPS spam.
- description : 2-3 punchy sentences that hook the viewer, deliver the value,
  and end with a soft CTA ("Follow for more"). No hashtags inside the text.
- hashtags : EXACTLY 3-5 tags. Mix 1 broad discovery tag (fyp or viral) with
  2-4 niche tags that MATCH the video topic. Best niche tags for this content :
  didyouknow, facts, learnontiktok, edutok, sciencefacts, randomfacts,
  interestingfacts, mindblown, knowledge, curiosity, education, tiktokfacts.
  Never generic filler - the tags must describe THIS video.

STRICT NICHE - CULTURE GENERAL :
- ALLOWED TOPICS : unusual facts, surprising numbers, debunked myths, useful tips.
- FORBIDDEN : thriller, dark, controversial, supernatural, narrative fiction
  (fictional characters/places).
- Content discoverable by a broad audience, not an internal niche.

ABSOLUTE RULES (non-negotiable) :
- SAFE CONTENT : nothing illegal, dangerous, shocking, defamatory, political,
  religious, dubious health advice, or sexual. If a topic drifts toward a
  sensitive area, drop it and pick a 100% safe angle.
- HOOK in the 1-2nd SECOND : one sentence that stops the scroll with a number,
  a contradiction or a curiosity tension. NO "hello, today", NO lazy
  "did you know...". A single sentence, MAX 12 words.
- MANDATORY HOOK OPENER (NON-NEGOTIABLE) : the hook MUST start with the
  second-person "Your" or "You". The VERY FIRST word spoken in the video MUST
  be "Your" or "You". This is not optional. If the fact cannot naturally start
  that way, RE-ANGLE it onto the viewer's body, brain, home, food, phone, sleep
  or daily life so it can. Examples :
  "Your body replaces 50 billion cells every second."
  "You lose half your taste buds by 60."
  "Your phone carries more bacteria than a toilet seat."
  The hook still needs a number, a contradiction or a curiosity tension after
  the opener. NO descriptive statement, NO "did you know".
- UNIVERSAL HOOK : no imposed language, no divisive tone, no excluding cultural
  reference. The content must capture everyone.
- RETENTION : short sentences, fast rhythm, ONE strong idea per sentence.
- DURATION : the narration must fit in 25 to 35 seconds. Budget MAX ~140 words
  for texte_continu (about 4.3 words/s). ZERO filler, ZERO digression, ZERO
  list-of-three for decoration.
- LOOP : the ENDING (last sentence) must ECHO the opening hook to trigger the
  rewatch. texte_continu STARTS with the exact hook sentence and ENDS with the
  ending.
- Reply ONLY with valid JSON, no text around it.
`;

// ------------------------------------------------------------
// 1) IDEA GENERATION
// ------------------------------------------------------------
export interface Idear {
  sujet: string; // the fact / concept of the video (one sentence)
  titre: string; // catchy video title
  hook: string; // hook sentence for the first 1-2 seconds
  angle: "curiosite" | "chiffre" | "contraire" | "mythe" | "astuce";
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
topics (Eiffel Tower, eternal honey, three-heart octopus, horned vikings, ant,
penguin, brain/stars...). Forbid thriller/dark approaches. If a topic is given
as a direction, get inspired by it but vary. Each idea must be THE most
surprising and the least seen possible. Choose facts that trigger the "I didn't
know that" or "that's impossible" : the viewer must want to share or comment.
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
      "hook": "THE HOOK (one sentence, max 12 words) : MUST START with the exact word 'Your' or 'You' (NON-NEGOTIABLE), then a number, a contradiction or a curiosity tension that stops the scroll",
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
}): LlmMessage[] {
  const { idea, language = "en" } = opts;

  const system = COMMON_RULES +
    `\nTurn the idea into a complete short-video script, ready to be read as voiceover.
Progression :
- HOOK (1-2s) : the sentence that stops the scroll. THE most important part.
  It MUST START with the exact word "Your" or "You" (NON-NEGOTIABLE). If the
  idea cannot naturally start that way, RE-ANGLE it onto the viewer's body,
  brain, home, food, phone or daily life so the FIRST SPOKEN WORD is "Your" or
  "You".
- BODY (12-15s) : the fact, explained with one strong idea per sentence.
- PROOF (8-10s) : a number, a comparison or an example that validates the hook.
- ENDING (4-6s) : the LOOP. The last sentence echoes the opening hook to push rewatch.
- CTA (optional, MAX 2s) : ONE short sentence ("Subscribe"). Place it BEFORE the
  ending, NEVER after - the last thing heard must be the ending.
texte_continu MUST start with the exact hook sentence, then flow, and END with
the ending. Total target duration : 25-35s, budget MAX ~140 words.`;

  const user = `Idea to develop : "${idea}"
Language : ${language}
Reply with this exact JSON schema :
{
  "titre": "short punchy title (internal use)",
  "titre_youtube": "YouTube-optimized title : catchy, SEO, rephrased from the hook, maximum 100 characters",
  "hook": "THE HOOK alone (one sentence, max 12 words) : MUST START with the exact word 'Your' or 'You' (NON-NEGOTIABLE), then a number, a contradiction or a curiosity tension that stops the scroll",
  "duree": "approximate narration duration, ex \"32s\"",
  "texte_continu": "the COMPLETE narration in one paragraph (MAX ~140 words), ready for speech synthesis. The VERY FIRST WORD MUST be 'Your' or 'You'. STARTS with the EXACT hook sentence, then flows (body, proof), and ENDS with the ending that echoes the hook",
  "structure": [
    { "partie": "hook",   "texte": "...", "duree": "3s" },
    { "partie": "corps",  "texte": "...", "duree": "13s" },
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
You are an expert who translates a narration sentence into a precise and VISUAL
image search query for Pexels (photo stock). You write in English.
Rules :
- ONE short query per segment (2 to 6 words), concrete, showing the real
  object/animal/scene the sentence talks about. Ex : "horned viking helmet",
  "flamingo", "blood vessels".
- Focus on the video SUBJECT : the query must stay in the video theme.
- IGNORE negations : "never existed" must NOT give "no helmet", but the photo
  of the object being talked about ("horned viking helmet").
- Never combine two different subjects in the same query.
- No filler words, no isolated numbers, no "a/an/the".
- If the sentence is a call to action or contains nothing visual, reply with a
  query about the video subject (representative background image).
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