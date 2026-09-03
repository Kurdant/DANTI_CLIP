import type { LlmMessage, LlmProvider } from "./types.js";

/**
 * Provider "mock" : ne contacte aucun service externe.
 * Il retourne des sorties simulees valides afin de tester le
 * pipeline de bout en bout sans cle API, puis developper
 * l'interface web et le montage en attendant la cle reelle.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";

  async complete(messages: LlmMessage[]): Promise<string> {
    // On concatene toute la conversation pour detecter la tache de facon fiable.
    const all = messages.map((m) => m.content).join("\n");
    const isIdees = /Fournis exactement/i.test(all) || /idees/i.test(all);
    const isScript = /Transforme l'idee en script/i.test(all) || /\bscript\b/i.test(all);

    if (isScript) {
      return JSON.stringify({
        titre: "Le truc qui change tout",
        hook: "Personne ne te l'a jamais dit, mais...",
        duree: "30s",
        structure: [
          { partie: "hook", texte: "Personne ne te l'a jamais dit, mais...", duree: "3s" },
          { partie: "corps", texte: "Voila exactement ce qui se passe quand tu fais ceci chaque matin.", duree: "12s" },
          { partie: "preuve", texte: "Et le pire, c'est que ca semble evident une fois qu'on te l'explique.", duree: "10s" },
          { partie: "cta", texte: "Abonne-toi pour ne pas rater le prochain.", duree: "5s" },
        ],
        texte_continu:
          "Personne ne te l'a jamais dit, mais... Voila exactement ce qui se passe quand tu fais ceci chaque matin. Et le pire, c'est que ca semble evident une fois qu'on te l'explique. Abonne-toi pour ne pas rater le prochain.",
      });
    }

    if (isIdees) {
      const ideas = Array.from({ length: 3 }).map((_, i) => ({
        sujet: `Sujet distinct n°${i + 1} (une direction differente)`,
        titre: `Titre accrocheur n°${i + 1}`,
        hook: `Hook accrocheur n°${i + 1}`,
        angle: i % 2 === 0 ? "curiosite" : "contraire-a-l'opinion-courante",
        fond: `Fond animé n°${i + 1}`,
      }));
      return JSON.stringify({ idees: ideas });
    }

    return JSON.stringify({ reponse: "OK" });
  }
}
