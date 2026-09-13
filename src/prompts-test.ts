import type { LlmMessage } from "./llm/types.js";

// ============================================================
// PROMPTS "TEST" - canal bac a sable.
// Meme structure que la prod, mais un TON HYPE / GOOFY / gen Z
// (looksmaxxing, unhinged, goated...) que l'on teste avant de
// l'appliquer a la prod. Objectif : voix plus vivante, percutante.
// ============================================================

const COMMON_RULES_TEST = `
You are an expert copywriter for viral short videos (Shorts / Reels / TikTok).
You write in ENGLISH, engaging tone, credible, appealing to a broad audience.
- SINGLE LANGUAGE ENGLISH : the title, title_youtube, hook, narration body and
  description are ALWAYS in English. NEVER a word, title or sentence in another
  language, even mixed. If you hesitate, translate into English.

TONE - HYPE, ENERGETIC, GOOFY :
- You sound like an energetic creator hyping the viewer, NOT a documentary.
- Keep it CLEAR and CREDIBLE - the fact stays real, but the delivery is fun,
  lively and a little absurd. Avoid corporate or dry language.
- The hook must be SHOCKING and hype, then the proof keeps the energy up.

SLANG - OPTIONAL, AT MOST ONE, NEVER IN THE HOOK :
- The hook MUST stay 100% clear and instantly understandable : NO slang in the
  hook, ever. The first sentence is sacred - it must be understood by everyone.
- In the BODY ONLY, you may use AT MOST ONE slang word, chosen from this list :
  W, cooked, no cap, maxxing, rizzler, mogging, mogged, mewing, rizz, goat,
  goated, NPC, main character, peak, mid, aura.
- Never force it. If it does not fit naturally, use NONE. Clarity always beats
  slang. When in doubt, drop the slang word entirely.
- Keep the WHOLE hook to MAX 12 words.

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
  be "Your" or "You". If the fact cannot naturally start that way, RE-ANGLE it
  onto the viewer's body, brain, home, food, phone, sleep or daily life so it
  can. The hook still needs a number, a contradiction or a curiosity tension
  after the opener. NO descriptive statement, NO "did you know".
- UNIVERSAL HOOK : no imposed language, no divisive tone, no excluding cultural
  reference. The content must capture everyone.
- RETENTION : short sentences, fast rhythm, ONE strong idea per sentence.
- DURATION : the narration must fit in 25 to 35 seconds. Budget MAX ~140 words
  for texte_continu (about 4.3 words/s). ZERO filler, ZERO digression.
- LOOP : the ENDING (last sentence) must ECHO the opening hook to trigger the
  rewatch. texte_continu STARTS with the exact hook sentence and ENDS with the
  ending.
- Reply ONLY with valid JSON, no text around it.
`;

export interface Idear {
  sujet: string;
  titre: string;
  hook: string;
  angle: "curiosite" | "chiffre" | "contraire" | "mythe" | "astuce";
  fond: string;
}
export interface IdeasResult { idees: Idear[] }

export function messagesIdeesTest(opts: {
  topic: string;
  nIdeas: number;
  language?: string;
  usedTopics?: string[];
}): LlmMessage[] {
  const { topic, nIdeas, language = "en", usedTopics = [] } = opts;
  const hasTopic = topic.trim().length > 0;

  const system = COMMON_RULES_TEST +
    `\nProvide exactly ${nIdeas} COMPLETELY DIFFERENT CULTURE GENERAL TOPICS.
Each topic must have a high discovery potential : an unusual fact, a surprising
number, a myth to debunk, or a useful tip. Choose facts LITTLE KNOWN to the
general public WITH a real verifiable number. FORBIDDEN overused topics (Eiffel
Tower, eternal honey, three-heart octopus, horned vikings, ant, penguin,
brain/stars...). Forbid thriller/dark approaches. If a topic is given as a
direction, get inspired by it but vary. Each idea must be THE most surprising
and the least seen possible. Choose facts that trigger the "I didn't know that"
or "that's impossible" : the viewer must want to share or comment.`;
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
      "titre": "catchy, hype title that makes people click",
      "hook": "THE HOOK (one sentence, max 12 words) : MUST START with the exact word 'Your' or 'You' (NON-NEGOTIABLE), then a shocking number, a contradiction or a curiosity tension that stops the scroll",
      "angle": "curiosite | chiffre | contraire | mythe | astuce",
      "fond": "short description of the ideal background visual (1 sentence)" }
  ]
}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export interface ScriptPart {
  partie: "hook" | "corps" | "preuve" | "chute" | "cta";
  texte: string;
  duree: string;
}
export interface ScriptResult {
  titre: string;
  titre_youtube: string;
  hook: string;
  duree: string;
  texte_continu: string;
  structure: ScriptPart[];
  fond: string;
  description: string;
  hashtags: string[];
}

export function messagesScriptTest(opts: {
  idea: string;
  language?: string;
}): LlmMessage[] {
  const { idea, language = "en" } = opts;

  const system = COMMON_RULES_TEST +
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
texte_continu MUST start with the exact hook sentence, then flow, and END with the
ending. Total target duration : 25-35s, budget MAX ~140 words. Keep the HYPE tone
throughout : energetic, punchy, goofy. Slang is OPTIONAL : AT MOST ONE slang word
in the BODY, and NEVER in the hook - the hook must stay instantly clear.`;

  const user = `Idea to develop : "${idea}"
Language : ${language}
Reply with this exact JSON schema :
{
  "titre": "short punchy title (internal use)",
  "titre_youtube": "YouTube-optimized title : catchy, hype, SEO, rephrased from the hook, maximum 100 characters",
  "hook": "THE HOOK alone (one sentence, max 12 words) : MUST START with the exact word 'Your' or 'You' (NON-NEGOTIABLE), then a number, contradiction or curiosity tension that stops the scroll",
  "duree": "approximate narration duration, ex \"32s\"",
  "texte_continu": "the COMPLETE narration in one paragraph (MAX ~140 words), ready for speech synthesis. The VERY FIRST WORD MUST be 'Your' or 'You'. STARTS with the EXACT hook sentence, then flows (body, proof), and ENDS with the ending that echoes the hook. HYPE and lively tone",
  "structure": [
    { "partie": "hook",   "texte": "...", "duree": "3s" },
    { "partie": "corps",  "texte": "...", "duree": "13s" },
    { "partie": "preuve", "texte": "...", "duree": "9s" },
    { "partie": "chute",  "texte": "...", "duree": "5s" }
  ],
  "fond": "description of the ideal background for this video (1 sentence)",
  "description": "video description for YouTube : 2-3 hype, engaging sentences that summarize the video and reuse the hook tension, without hashtags",
  "hashtags": ["3-5", "short", "keywords", "without", "#", "relevant", "for", "the", "niche"]
}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}