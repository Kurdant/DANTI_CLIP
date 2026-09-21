# Agent TikTok Content Engine

Créé pour Yan le 17 septembre 2026 dans DANTI_CLIP. Plateforme vérifiée : opencode 1.18.31.

## Ce qui est installé

`tiktok-content-engine` est un **agent principal**, sélectionné par défaut pour ce projet via `opencode.json`. Il est chargé de l’audit intégral, de la documentation de référence et de l’implémentation progressive du moteur d’optimisation décrit par Yan.

Son prompt est composé nativement par opencode :

```text
activation.md
    +
prompt-original.md (36 phases intégrales)
```

Les deux fichiers sont injectés via `{file:...}` dans `agent.tiktok-content-engine.prompt`. Ce n’est pas une simple consigne demandant au modèle de retrouver ultérieurement un long prompt. Les chemins sont relatifs à `opencode.json` et restent utilisables si le dépôt est déplacé avec les fichiers associés.

La définition utilise un prompt Markdown externe référencé dans la configuration, plutôt qu’une copie supplémentaire sous `.opencode/agent/` : `.opencode/` est ignoré par le dépôt. Il n’existe qu’une copie canonique du texte original, sans risque de divergence entre deux versions installées.

Les agents BYAN et Nova (`croissance-shorts`) ne sont ni supprimés ni modifiés. Le nouveau prompt ne reprend pas leurs anciennes limites de durée. Aucun modèle n’est forcé : l’agent utilise le modèle choisi/configuré dans opencode. Aucun fournisseur, plugin, MCP ou plafond de dépenses n’a été changé. Les permissions héritées sont conservées ; seule une confirmation d’édition est ajoutée pour le fichier du prompt original. Cette règle n’est pas une protection absolue contre une modification par un autre outil : l’empreinte d’intégrité reste le contrôle de référence.

## Fichiers créés

| Fichier | Fonction |
| --- | --- |
| `opencode.json` à la racine | Enregistrement, agent principal par défaut, références de fichiers et confirmation d’édition du texte original. |
| `prompt-original.md` | Texte de Yan intégral, sans réécriture ni résumé. |
| `activation.md` | Rôle, responsabilités, capacités, principes transmis, protocole d’audit/implémentation/tests et précautions de reprise. |
| `contexte-reprise.md` | Cartographie technique sourcée, glossaire, MCD/MCT de départ, réutilisation, écarts et inconnues. Ne remplace pas l’audit intégral. |
| `couverture.md` | Registre initial des 36 phases et des preuves à produire. Ne prétend pas que l’application les implémente. |
| `verify-agent.test.mjs` | Tests d’intégrité, de structure et de chargement réel par opencode, sans dépendance ajoutée. |
| `README.md` | Installation, vérification, limites, démarrage et retour arrière. |

Hormis `opencode.json`, tous les chemins de ce tableau sont relatifs à `_byan-output/bmb-creations/tiktok-content-engine/`.

## Fidélité au prompt transmis

Les deux messages complets de Yan ont été retrouvés dans l’export de la session courante et comparés : ils portent le même texte. La copie a ensuite été comparée à ces messages, et non à un résumé généré ou à sa propre empreinte calculée après coup.

- 36 phases, dans l’ordre et avec leurs titres exacts.
- 28 sections prescrites pour le futur `TIKTOK_CONTENT_ENGINE.md`.
- 10 étapes opérationnelles finales et le critère final de réussite.
- 1 529 lignes, 32 939 octets UTF-8 dans le fichier sauvegardé.
- Texte identique à celui transmis, y compris son espace final ; seul un saut de ligne final est ajouté au fichier.
- SHA-256 de cette copie avec saut de ligne final :

```text
681fd81559ccc2804eb9691cc26cb783f316ef76c0aa5dbf2ce4c8c77803926f
```

Ne pas reformater automatiquement le texte original, même pour corriger une indentation ou un espace final. Une adaptation d’implémentation se documente dans les décisions techniques, pas en modifiant le cahier des charges historique. Le chargeur natif opencode retire les espaces de bord de ses substitutions ; les tests confirment que tout le contenu interne reste identique.

## Contrôles effectués

Depuis la racine du dépôt :

```bash
node --test _byan-output/bmb-creations/tiktok-content-engine/verify-agent.test.mjs
opencode debug agent tiktok-content-engine
```

Résultat à l’installation : **7 tests réussis, 0 échec**. Le cycle a commencé par des tests en échec avant création des fichiers. Un écart d’espace final avec le message original a ensuite été détecté et corrigé, sans modifier l’empreinte de référence.

Le test de chargement utilise un nouveau processus `opencode debug config` et contrôle notamment : agent principal par défaut, prompt original entièrement chargé, activation présente, BYAN/Nova toujours disponibles. `opencode debug agent tiktok-content-engine` confirme le nom, le mode `primary`, les 36 phases et l’absence de modèle imposé.

Les contrôles ne démarrent pas le serveur DANTI_CLIP, ne migrent pas SQLite, ne génèrent pas de vidéo et ne publient rien. Ils ne nécessitent aucun appel LLM de génération. Le chargement normal d’opencode peut toutefois initialiser sa propre configuration et son outillage.

### Limites de la validation

- Une copie fidèle et une configuration valide ne garantissent pas qu’un modèle respectera parfaitement chaque exigence pendant toute la mission. Le registre et les tests métier à venir sont nécessaires pour vérifier les résultats.
- Aucune session de transformation applicative n’a été lancée avec le nouvel agent pendant cette installation.
- La délégation d’analyse a été bloquée par le plafond mensuel du service de sous-agents ; aucune analyse déléguée ni revue par un autre modèle n’est revendiquée. Cartographie et seconde passe de vérification ont été effectuées directement.
- Pas de certification exhaustive des 64 mantras BMAD : les principes prioritaires sont explicitement intégrés, mais les tests ci-dessus vérifient la transmission et la configuration opencode, pas une certification de l’application.
- Les API TikTok, données de rétention et autres nouvelles intégrations doivent encore être vérifiées pendant la mission. Une clé YouTube et des compteurs de vues ne les rendent pas disponibles.
- Aucun résultat de tests applicatifs, typecheck, build frontend ou gain de vues n’est revendiqué pour cette installation, puisqu’aucun code applicatif n’a été changé.

## Démarrer le nouvel agent

**Quitter puis redémarrer opencode est nécessaire.** La session déjà ouverte conserve la configuration chargée au démarrage ; créer l’agent ne transforme pas rétroactivement BYAN en cet agent.

Depuis la racine du projet, ouvrir une nouvelle session :

```bash
opencode --agent tiktok-content-engine
```

Ou relancer `opencode` et vérifier que `tiktok-content-engine` est sélectionné ; il est désormais le défaut du projet. Une session ancienne reprise explicitement peut conserver son agent précédent.

Premier message recommandé :

> Prends le projet en main. Exécute le prompt intégral : commence par l’audit complet du dépôt, puis crée TIKTOK_CONTENT_ENGINE.md, propose l’architecture et les fichiers précis, implémente les P0 progressivement, teste, corrige et documente les décisions. Ne supprime aucune exigence reportée en P1/P2/P3. Continue les étapes non bloquées.

L’agent doit commencer par l’analyse en lecture seule. Il ne doit pas considérer la cartographie d’installation comme la phase 1 terminée. Après cet audit, il doit poursuivre vers une implémentation réelle, pas s’arrêter à un document théorique.

## Effets sur le projet et retour arrière

- Aucun fichier applicatif préexistant n’a été modifié par l’installation. La modification préexistante de `web/index.html`, les images et autres fichiers non suivis ont été préservés.
- Aucune nouvelle table, API métier, tâche planifiée, variable d’environnement applicative ou métrique n’est créée à ce stade. Ces livrables appartiennent à la mission du nouvel agent.
- `TIKTOK_CONTENT_ENGINE.md` n’a volontairement pas été créé sur la base de cet audit partiel ; sa création détaillée suit l’analyse complète conformément au prompt.
- Aucun commit, amendement ou push n’a été effectué.
- Pour revenir à BYAN sans supprimer le nouvel agent : `opencode --agent byan` dans une nouvelle session.
- Pour changer le défaut : modifier uniquement `default_agent` dans `opencode.json`, puis redémarrer.
- Ne pas supprimer les fichiers référencés en laissant leurs `{file:...}` dans la configuration. Pour désinstaller, retirer d’abord la définition et le défaut associés, en conservant toute configuration ajoutée ultérieurement par l’utilisateur.
- En cas de configuration locale illisible : `OPENCODE_DISABLE_PROJECT_CONFIG=1 opencode` permet de redémarrer sans la configuration du projet pour la corriger.

Sources de configuration consultées : skill `customize-opencode`, documentation officielle <https://opencode.ai/docs/config/#files>, et validation par le chargeur local opencode 1.18.31.
