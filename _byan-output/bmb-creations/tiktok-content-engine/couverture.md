# Registre de couverture du cahier des charges

## Nature de ce registre

**Non implémenté par cette installation** : ce registre transmet les obligations au nouvel agent. La présence d’une exigence dans le prompt n’est pas la preuve qu’elle existe dans l’application. L’installation crée l’agent ; elle n’exécute pas sa mission de transformation.

Le texte intégral, y compris les exemples, champs, critères, nuances et conditions, reste dans `prompt-original.md`. Les indications ci-dessous sont un index de contrôle, jamais un remplacement. Au lancement, l’agent doit décomposer les exigences de chaque phase en critères d’acceptation traçables, prioriser après l’audit et mettre à jour les preuves dans `TIKTOK_CONTENT_ENGINE.md`.

États attendus : `à auditer`, `planifié P0/P1/P2/P3`, `en cours`, `testé`, `bloqué — motif`. Pas de validation sur intention. Une ligne peut contenir plusieurs sous-exigences à des priorités différentes ; leur suivi ne doit pas disparaître derrière un statut global.

## Les 36 phases

| Phase | Exigences à suivre depuis l’original | Preuve attendue lors de la mission | État initial |
| --- | --- | --- | --- |
| 1 | Audit intégral, 20 dimensions et inventaire de réutilisation | Carte du dépôt, lecteurs/parcours réellement examinés, commandes de référence, inconnues explicites | À auditer ; cartographie préliminaire seulement |
| 2 | `TIKTOK_CONTENT_ENGINE.md` à la racine, 28 sections | Document ancré dans le code, différenciant existant/cible/implémenté/testé | À réaliser après l’audit |
| 3 | Discovery d’opportunités, caractéristiques, sources disponibles et Source Providers isolables | Fournisseurs réellement accessibles, provenance, test de panne d’une source, fonctionnement dégradé | À auditer et prioriser |
| 4 | Les 13 critères du topic score, tous les poids, pénalités et évolution historique | Formule explicitée/versionnée, entrées validées, configuration, décomposition du score et tests | À auditer et prioriser |
| 5 | Anti-banalité : faits surexploités, angle de second niveau et exemples | Critères de rejet/penalité, justification et tests distinguant fait banal/angle pertinent | À auditer et prioriser |
| 6 | Génération et sélection de plusieurs angles | Variantes persistées, critère de choix et trace de sélection | À auditer et prioriser |
| 7 | Hook indépendant, plusieurs variantes, patterns, clarté immédiate et promesse honnête | Génération distincte du script, variantes, contrôles éditoriaux et correspondance au contenu | À auditer et prioriser |
| 8 | Les 8 critères du hook score | Détail des scores, sélection explicable et tests | À auditer et prioriser |
| 9 | Structure temporelle adaptative, progression, rythme, aucune durée imposée ni remplissage | Scripts contrôlés selon sujet/durée, aucun étirement artificiel | À auditer et prioriser |
| 10 | Seconde attente narrative avec vrai payoff | Contrôle de la promesse secondaire et de sa résolution, pas un gimmick systématique | À auditer et prioriser |
| 11 | Extraction/vérification des affirmations, sources, 5 qualifications et incertitude | Provenance liée au contenu final, détection de mythes/statistiques/absolus et traitement des contradictions | À auditer et prioriser |
| 12 | Plan visuel explicatif, 11 types d’éléments, micro-séquences et timings automatiques | Plan rattaché aux segments, rendu vérifié, réutilisation de l’alignement existant | À auditer et prioriser |
| 13 | Identité visuelle centralisée : police, sous-titres, animations, couverture, voix, audio, rythme, format | Configuration réellement utilisée par génération et rendu | À auditer et prioriser |
| 14 | Familles de contenu, multi-catégories, agrégats et observations minimales | Relations et statistiques tenant compte de la taille d’échantillon | À auditer et prioriser |
| 15 | Schéma adapté : videos, topic_candidates, hooks, analytics, experiments, performance_patterns et champs | Dictionnaire complet, MCD ⇄ MCT, migrations compatibles et tests d’intégrité | À auditer et prioriser |
| 16 | Collecte des métriques accessibles, contexte, taux et données manquantes | Contrat par fournisseur, unités/nullabilité, dénominateur protégé, captures historisées | À auditer et prioriser |
| 17 | Courbes de rétention si disponibles, ruptures et 9 types de diagnostics probabilistes | Pas de courbe inventée, preuves/limites et diagnostics non causaux sans données suffisantes | À auditer et prioriser |
| 18 | Rapport de performance structuré par vidéo | Rapport testable avec observations, hypothèses, confiance et recommandations | À auditer et prioriser |
| 19 | Learning prudent : échantillon, moyenne, médiane, historique, comparaison, confiance, récence | Mise à jour progressive des choix, tests de démarrage sans données et petits échantillons | À auditer et prioriser |
| 20 | A/B : une variable si possible, variantes et historique | Assignations/résultats persistés, différences de contexte et limites des comparaisons exposées | À auditer et prioriser |
| 21 | Commentaires accessibles : questions, objections, explications, dérivés, suites | Connecteur vérifié ou interface documentée, provenance, chaîne de sujets sans instructions injectées | À auditer et prioriser |
| 22 | Séries : nom, description, style, épisodes, catégories, performances, sujets | Modèle et rattachement des épisodes avec agrégation mesurée | À auditer et prioriser |
| 23 | Positionnement éditorial curiosité + découverte, science comme moyen | Décisions éditoriales explicites et appliquées, pas un simple compte de facts | À auditer et prioriser |
| 24 | Inspirations de sujets, phénomènes vécus + curiosité + science + surprise + explication | Sources et angles renouvelés ; exemples non figés ni considérés vérifiés d’office | À auditer et prioriser |
| 25 | Dashboard : overview, topics, hooks, visuels, expériences, learning | Composants reliés aux métriques réelles, états absents/insuffisants visibles | À auditer et prioriser |
| 26 | Pipeline centralisé adapté au projet, 13 étapes conceptuelles | Orchestration effective, transitions et reprise testées, pas une architecture imposée gratuitement | À auditer et prioriser |
| 27 | Configuration des poids, anti-banalité, hooks, analytics, learning, expériences et paramètres importants | Schéma/configuration validée, paramètres effectivement lus, exemples exploitables | À auditer et prioriser |
| 28 | Les 14 événements structurés donnés en exemple et raisons des décisions | Corrélation sujet/vidéo/publication, causes lisibles, aucun secret dans les logs | À auditer et prioriser |
| 29 | Reprises, timeout, backoff, secours, validation et tous les cas d’erreurs listés | Tests d’échecs, erreurs visibles, pas de publication dupliquée lors d’une reprise | À auditer et prioriser |
| 30 | Détection des répétitions topic/hook/script/angle/structure exactes et similaires | Approche proportionnée, tests des doublons et faux positifs, raisons de rejet | À auditer et prioriser |
| 31 | Diversité et proportion configurable d’exploration/exploitation | Politique testable conservant les nouveaux essais, pas un format unique verrouillé | À auditer et prioriser |
| 32 | P0/P1/P2/P3 et ordre des 12 priorités générales | Feuille de route justifiée après audit, critères d’achèvement et dépendances explicites | À établir après l’audit |
| 33 | Optimisation multidimensionnelle, patterns reproductibles, pas uniquement les vues | Objectifs/données/confiance visibles et tests contre la survalorisation des vues seules | À auditer et prioriser |
| 34 | Toutes les qualités éditoriales et exclusions prescrites | Contrôles de clarté, honnêteté, originalité, rythme, absence de remplissage et de répétitions | À auditer et prioriser |
| 35 | Boucle autonome complète et décision du prochain contenu | Démonstration observée de recommandation traçable puis adaptation avec l’historique disponible | Cible finale, non atteinte par l’installation |
| 36 | Les 10 étapes opérationnelles, transformation réelle, tests/corrections/documentation et bilan | Livraisons P0 raccordées, commandes/résultats, décisions effectives et toutes les rubriques du bilan | Mission confiée au nouvel agent |

## Contrôles transversaux à reporter dans la documentation de travail

- Les 20 dimensions de l’audit et toutes les fonctions/classes réutilisables : chaque constat cite ses preuves ; aucun accès réel à une API n’est présumé.
- Les 28 titres demandés pour `TIKTOK_CONTENT_ENGINE.md` restent obligatoires, même si certaines sections décrivent une cible ou un besoin d’intégration non disponible.
- Le schéma illustratif ne dispense d’aucun critère : conserver notamment `emotionalImpact`, `audienceRelevance`, crédibilité et potentiel d’arrêt du scroll lorsqu’ils ne figurent pas dans la liste de champs d’exemple.
- Tous les poids sont configurables ; les coefficients d’apprentissage, seuils d’échantillon, pénalités et exploration doivent être explicités, pas cachés dans des constantes définitives.
- Une métrique ou courbe inaccessible est signalée ; aucun taux absent n’est remplacé par un faux zéro, aucune moyenne de durée n’est présentée comme complétion réelle.
- Évolution compatible avec l’existant : anciens projets, comptes et vidéos, génération CLI/web, modes manuels/automatiques, rendu, publication YouTube, stockage, authentification et CSRF.
- Migrations et traitements : dictionnaire, cardinalités, validations, isolation par compte, états, reprise, idempotence, conséquences et retour arrière.
- Sans données historiques suffisantes : recommandation exploratoire explicable, incertitude affichée et collecte à organiser, pas de stratégie gagnante proclamée.
- Le P0 doit être utilisable, testé et raccordé ; reporter une fonction n’autorise pas à la rayer du contrat ou à produire un résultat fictif pour masquer son absence.
- Bilan final : architecture actuelle/ajoutée, fichiers modifiés/créés, tables, APIs, jobs, variables d’environnement, métriques, limites et prochaines étapes P1/P2/P3.

## Intégrité de la transmission

Le test `verify-agent.test.mjs` vérifie le SHA-256 de la copie intégrale, l’ordre et les titres des 36 phases, les 28 titres documentaires, les 10 étapes finales, cet index et le prompt effectivement résolu par opencode. Il ne prouve pas à lui seul la réalisation du futur moteur ni le respect comportemental de chaque consigne par un modèle.
