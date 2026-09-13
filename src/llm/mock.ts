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
    const isIdees = /Fournis exactement/i.test(all) || /"idees"/i.test(all);
    const isScript = /"texte_continu"/i.test(all) || /"structure"/i.test(all) || /Transforme l'idee/i.test(all);

    // Requetes de recherche d'images par segment : renvoie une requete par segment
    // (contenu utile sans cle reelle : on extrait les mots-clefs visuels de chaque segment).
    if (/requete Pexels courte/i.test(all) || /"queries"/i.test(all)) {
      const segMatch = all.match(/(?:^|\n)\s*(\d+\.\s.+)/g) ?? [];
      const queries = segMatch.map((line) => {
        const t = line.replace(/^\s*\d+\.\s*/, "").trim();
        const words = t
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3 && !/^(cette|ces|leur|leurs|plus|avec|pour|dans|sans|puis|mais|quand|soit|une|des|les|nous|vous|elle|ils)$/.test(w));
        return words.slice(0, 4).join(" ") || "nature";
      });
      return JSON.stringify({ queries });
    }

    if (isScript) {
      return JSON.stringify({
        titre: "Ce que l'eau froide ne fait pas",
        titre_youtube: "Ton mal de gorge ne vient pas de l'eau froide, voici la vraie cause",
        hook: "Ton mal de gorge ne vient pas de l'eau froide.",
        duree: "30s",
        structure: [
          { partie: "hook", texte: "Ton mal de gorge ne vient pas de l'eau froide.", duree: "3s" },
          { partie: "corps", texte: "C'est un virus qui déclenche la réaction, pas la température de ta boisson.", duree: "12s" },
          { partie: "preuve", texte: "Les études montrent que boire froid ne baisse pas tes défenses, c'est le contact qui propage.", duree: "10s" },
          { partie: "chute", texte: "Alors la prochaine fois que tu bois froid, pense-y : ce n'est pas l'eau, c'est ce qui l'accompagne.", duree: "5s" },
        ],
        texte_continu:
          "Ton mal de gorge ne vient pas de l'eau froide. C'est un virus qui déclenche la réaction, pas la température de ta boisson. Les études montrent que boire froid ne baisse pas tes défenses, c'est le contact qui propage. Alors la prochaine fois que tu bois froid, pense-y : ce n'est pas l'eau, c'est ce qui l'accompagne.",
        description:
          "On t'a toujours dit d'éviter l'eau froide pour ne pas tomber malade. Mais la vérité est ailleurs. Une explication courte et claire pour démêler le mythe de la réalité.",
        hashtags: ["mythe", "sante", "eau-froide", "culture-generale", "shorts", "explication"],
      });
    }

    if (isIdees) {
      const ideas = Array.from({ length: 3 }).map((_, i) => ({
        sujet: `Fait insolite n°${i + 1} : une info surprenante et verifiable`,
        titre: `Ce que personne ne sait sur ${i + 1}`,
        hook: i === 0 ? "Tu dors un tiers de ta vie." : `Le chiffre n°${i + 1} qui va te surprendre.`,
        angle: ["chiffre", "contraire", "mythe"][i % 3],
        fond: `Fond animé culture générale n°${i + 1}`,
      }));
      return JSON.stringify({ idees: ideas });
    }

    return JSON.stringify({ reponse: "OK" });
  }
}
