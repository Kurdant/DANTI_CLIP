import type { TopicEvaluation } from "./scoring.js";

// ============================================================
// CONTENT ENGINE - anti-banalite heuristique (pure, sans LLM).
// Detecte les facts surexploites et les "facts en une phrase",
// en complement du jugement de l'evaluateur LLM. Sert aussi de
// repli deterministe si l'evaluation LLM echoue.
// ============================================================

/** Faits notoirement surexploites (normalises a la comparaison). */
const OVERUSED_FACTS = [
  "poulpe trois coeurs",
  "three heart octopus",
  "octopus three hearts",
  "abeilles dansent",
  "abeilles danse",
  "bees dance",
  "foudre plus chaude soleil",
  "lightning hotter sun",
  "miel eternel",
  "eternal honey",
  "tour eiffel",
  "eiffel tower",
  "viking cornes",
  "horned viking",
  "on utilise 10% cerveau",
  "we use 10% of our brain",
  "poisson rouge memoire 3 secondes",
  "goldfish memory three seconds",
  "autruche tete dans le sable",
  "ostrich head sand",
  "sucre rend hyperactif",
  "sugar makes kids hyperactive",
  "grande muraille visible depuis lune",
  "great wall visible from moon",
];

/** Normalise un texte pour comparaison (minuscules, sans accents, sans ponctuation). */
export function normalizeFact(s: string): string {
  return s
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Phrases de fait surexploite trouvees dans le texte (liste des origines). */
export function overusedMatches(text: string): string[] {
  const t = normalizeFact(text);
  return OVERUSED_FACTS.filter((f) => {
    if (t.includes(f)) return true;
    // Correspondance par jetons : tolere pluriels et mots intercalaires.
    const tokens = f.split(" ").filter(Boolean);
    return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
  });
}

/** Indice de banalite 0..1 base sur les faits surexploites. */
export function banalityHint(text: string): number {
  const matches = overusedMatches(text);
  if (matches.length === 0) return 0;
  return Math.min(1, 0.5 + matches.length * 0.25);
}

/** Un "fact brut en une phrase" (pas encore un angle de second niveau) ? */
export function isBareFact(text: string): boolean {
  const t = normalizeFact(text);
  const words = t.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 16) return false;
  const hasAngle = /pourquoi|comment|car|parce que|why|how|because|therefore|instead of/.test(t);
  return !hasAngle;
}

/**
 * Evaluation de repli si le LLM echoue : scores neutres, banalite/saturation
 * heuristiques. Jamais presentee comme un jugement fin ; `justification` le dit.
 */
export function fallbackEvaluation(text: string): TopicEvaluation {
  const b = banalityHint(text);
  const matched = overusedMatches(text);
  const bare = isBareFact(text);
  const banality = Math.max(0.5, b + (bare ? 0.25 : 0));
  return {
    scores: {
      demand: 0.5,
      curiosity: 0.5,
      emotionalImpact: 0.5,
      novelty: 0.5,
      visualPotential: 0.5,
      commentPotential: 0.5,
      sharePotential: 0.5,
      searchPotential: 0.5,
      audienceRelevance: 0.5,
      credibility: 0.6,
      saturation: b > 0 ? 0.9 : 0.5,
      banality: Math.min(1, banality),
      followUpPotential: 0.5,
    },
    penalties: {
      tooKnown: b > 0 ? 1 : 0,
      lowVisual: 0,
      tooGeneric: bare ? 1 : 0,
      hardToProve: 0,
      lowCredibility: 0,
    },
    justification:
      b > 0
        ? `evaluation LLM indisponible - fait surexploite detecte (${matched.join(", ")})`
        : bare
          ? "evaluation LLM indisponible - fait brut sans angle (heuristique)"
          : "evaluation LLM indisponible - scores neutres (heuristique)",
  };
}
