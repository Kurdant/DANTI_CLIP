# Contexte de reprise — DANTI_CLIP

Date : 17 septembre 2026. Destinataire : `tiktok-content-engine`.

## Statut et périmètre

Cartographie effectuée pour installer le nouvel agent. **Ce document n’est pas l’analyse intégrale exigée par la phase 1 et ne remplace pas `TIKTOK_CONTENT_ENGINE.md`.** Les composants ci-dessous ont été repérés ; certains ont été lus en détail, d’autres seulement inventoriés. L’agent doit poursuivre sa propre inspection avant toute modification applicative et consigner sa couverture réelle.

Aucune base réelle, aucun secret `.env`, aucune vidéo utilisateur et aucune API de publication n’ont été utilisés pour installer l’agent. Les droits effectifs des comptes et fournisseurs ne sont pas connus.

## Besoin métier et acteurs

Yan veut passer de la production de vidéos à la décision éditoriale mesurée : quelle vidéo produire ensuite, pourquoi, sujet, angle, hook, structure et style visuel, compte tenu de l’historique de SON compte. Les 36 phases intégrales sont dans `prompt-original.md` ; aucune fonctionnalité décrite dans ce fichier n’est retirée du périmètre final.

Acteurs à préserver : créateur/utilisateur authentifié, administration du service, compte de publication, fournisseurs de recherche/LLM/voix/médias, audience, planificateur. Le code est multi-utilisateur ; l’optimisation pour Yan ne justifie pas de mélanger les données de comptes différents.

### Dictionnaire de départ à enrichir

| Concept | Sens et vigilance |
| --- | --- |
| Projet | Unité actuelle de génération, rattachée à `user_id` ; peut porter plusieurs idées, scripts, voix et vidéos. |
| Sujet candidat | Opportunité éditoriale évaluée avant production ; à distinguer d’une vidéo déjà publiée. |
| Angle | Manière de traiter un même fait ; sélection distincte du sujet brut. |
| Hook | Accroche promise au spectateur ; plusieurs variantes à évaluer avant le script. |
| Affirmation | Proposition factuelle à sourcer, qualifier et éventuellement bloquer. |
| Catégorie | Famille éditoriale ; une vidéo peut en avoir plusieurs selon le contrat. |
| Publication | Association d’une vidéo, d’un compte, d’une plateforme et d’un état/date/identifiant externe. |
| Observation analytics | Mesure datée, avec unité, fournisseur et disponibilité ; pas un compteur anonyme écrasé sans historique. |
| Rétention | Évolution de l’audience au fil du temps ; distincte de la complétion et de la durée moyenne vue. |
| Pattern de performance | Association de caractéristiques et de résultats observés avec échantillon et incertitude ; pas une causalité prouvée. |
| Expérience | Comparaison historisée d’une variable et de ses variantes ; contrôler les différences de contexte. |
| Exploration | Part configurable de nouvelles options afin d’éviter l’enfermement dans les succès passés. |

## Cartographie technique et réutilisation

| Domaine | Preuves et composants repérés | Conséquence pour la reprise |
| --- | --- | --- |
| Structure | `src/`, `server/src/`, `web/src/`, `scripts/`, `assets/`, `data/`, `output/`, `_byan-output/`, `.opencode/` | Distinguer application, configuration d’agents, documents, médias et données privées. |
| Stack | `package.json` : TypeScript, ESM, Express 5, Zod 4, `tsx` ; `web/package.json` : React 18, React Router 7, Vite 7 | Conserver la stack sauf justification mesurable. |
| Entrée CLI | `src/index.ts`, `src/pipeline.ts:genererShort` | La CLI produit idées, script et voix. Ce n’est pas toute l’orchestration web. |
| Entrée serveur | `server/src/index.ts` | Monte les routes `/api`, sert `web/dist`, démarre les tâches périodiques et le seed administrateur. |
| Frontend | `web/src/App.tsx`, `main.tsx`, `api.ts`, `auth.tsx`, `types.ts` ; pages `Dashboard`, `Project`, `NewProject`, `Library`, `Automation`, `Connections`, `Settings`, `Login`, `Register` | Réutiliser navigation, sessions, formulaires, bibliothèque et progression. |
| Base de données | `server/src/db/db.ts:getDb`, `closeDb` ; `DatabaseSync` de `node:sqlite`, WAL, clés étrangères, timeout d’occupation | Schéma créé au démarrage et migrations conditionnelles `ALTER TABLE` ; tester sur copie/base temporaire. |
| Sécurité API | `server/src/auth/middleware.ts`, `sessions.ts`, `passwords.ts` ; portail auth/CSRF et Helmet dans `server/src/index.ts` | Préserver authentification, CSRF, isolation par utilisateur et messages d’erreur non sensibles. |
| Validation | `server/src/validate/schemas.ts` | Réutiliser Zod ; `extractJson<T>` n’effectue pas à lui seul une validation métier. |
| Génération web | `server/src/routes/workflow.ts:workflowRouter`, `generateProject`, `runFullCreation`, `startVideoRender` | Le parcours complet se trouve ici ; attention à ses chemins manuels et automatiques. |
| Idées | `src/prompts.ts:messagesIdees`, `src/videoTypes.ts:getVideoType` ; `workflow.ts:getUsedTopics`, `recordTopics` | La sélection automatique observée prend `ideasNow[0]`, pas un score déterministe auditable. |
| Scripts | `src/prompts.ts:messagesScript`, types `IdeasResult`, `ScriptResult`, `ScriptPart` ; `src/prompts-test.ts` | `prompts-test.ts` est un format vidéo alternatif de production, PAS une suite de tests. |
| LLM | `src/llm/types.ts:LlmProvider.complete`, `src/llm/index.ts:createLlm`, `openai.ts:OpenAiCompatibleProvider`, `extractJson`, `mock.ts` | Abstraction et fournisseur simulé réutilisables. Le fournisseur OpenAI compatible lu n’a pas de délai explicite ni de reprises et fixe `temperature: 0.9`. |
| Voix | `src/voice.ts:syntheseVoix`, `listerVoix` ; `workflow.ts:syntheseVoixQuota` ; `server/src/lib/ttsQuota.ts` | Fournisseurs Google, Azure et Edge repérés. Vérifier les conditions réelles de sélection, quota et repli ; ne pas déduire une gratuité illimitée d’un commentaire. |
| Visuels | `src/images.ts:segmentNarration`, `alignChunks`, `fetchPartImages`, `subjectQuery` ; Pexels ; `src/overlays.ts` | Micro-segmentation et alignement aux repères de mots déjà présents ; ne pas reconstruire ces capacités sans les examiner. |
| Sous-titres et rendu | `src/subs.ts:assForStyle`, `buildAss`, `buildHookIntroAss`, `TEXT_STYLES` ; `src/montage.ts:rendreVideo`, `MontageOptions` ; `server/src/lib/videoprocess.ts` | FFmpeg/ffprobe, styles ASS, mascotte, effets, musique et b-roll. Réutiliser le rendu, améliorer le plan visuel en amont. |
| Publication | `server/src/routes/youtube.ts:publishVideo`, `isYouTubeConnected`, `youtubeRouter` | Publication YouTube et OAuth constatés. Aucun connecteur TikTok repéré dans l’inventaire ; vérifier avant de créer une interface adaptée. |
| Analytics actuels | `server/src/lib/ytStats.ts:refreshUserVideoStats`, `refreshAllVideoStats` | YouTube Data API `videos.list?part=statistics` : vues, likes, nombre de commentaires ; clé API, lots de 50, timeout de 10 s, seuil de fraîcheur de 5 h. |
| Historique analytique | `videos.views`, `likes`, `comments`, `stats_updated_at`, `stats_status` dans `db.ts` | Les mesures sont mises à jour sur la vidéo. Aucun historique de snapshots/complétion/rétention/partages/enregistrements dans les tables lues. |
| Automatisation | `server/src/lib/automation.ts:nextSlot`, `tickAutomation`, `runAutomation` | Créneaux et fuseaux, verrou en mémoire par règle, avancement de `next_run_at` avant exécution, conservation puis publication YouTube. Pas une file distribuée durable. |
| Tâches périodiques | `server/src/index.ts` : purge dès démarrage puis chaque heure ; automatisation dès démarrage puis chaque minute ; statistiques après 60 s puis chaque 6 h | Démarrer le serveur peut produire des effets réels. Ne pas le faire pour un simple test de configuration. |
| Stockage | `src/config.ts:loadConfig`, `server/src/lib/env.ts:loadServerEnv`, `fspath.ts`, `backgrounds.ts`, `music.ts`, `sfx.ts` | SQLite, sorties locales, imports de médias, uploads utilisateurs. Préserver contrôle de chemin, quotas et droits. |
| Logs et erreurs | `console.log/error` avec préfixes, middleware d’erreurs, `ApiError`, `asyncHandler`, états de jobs et `automations.last_result` | Points d’accroche existants, pas encore le journal structuré de décisions demandé. Auditer aussi les erreurs aval et captures silencieuses. |
| Dashboard | `web/src/pages/Dashboard.tsx` montre projets/états et gestion de médias ; `Library.tsx`, `types.ts` à compléter dans l’audit | Ne pas confondre nombre de projets, nombre de vidéos et nombre de publications. Le tableau analytique cible reste à concevoir. |
| Scripts annexes | `scripts/ingest-defaults.ts`, `scripts/upload-backgrounds.ts`, `server/src/seed-cli.ts` | Inventorier les effets de bord et les droits avant exécution. |

## Modèle de données existant

Tables repérées dans `server/src/db/db.ts` : `users`, `sessions`, `projects`, `ideas`, `scripts`, `voices`, `videos`, `youtube_tokens`, `youtube_creds`, `user_topics`, `tts_usage`, `automations`.

Relations observées : utilisateur → projets → idées/scripts/voix/vidéos ; utilisateur → sessions/identifiants YouTube/sujets déjà traités/automatisations. Les voix peuvent référencer un script. Le projet référence les identifiants sélectionnés. Ne pas supposer une intégrité relationnelle non vérifiée dans le code et le schéma.

`ideas` possède déjà `hook`, `angle`, `titre`, `fond`. `videos` possède durée, fichiers, conservation, métadonnées de publication et stats YouTube. Une migration additive et la traçabilité des variantes sont à étudier avant de dupliquer ces concepts.

### Cross-validation MCD ⇄ MCT de départ

| Données | Traitement observé ou attendu | Vérification à poursuivre |
| --- | --- | --- |
| `user_topics` | Mémoire anti-répétition injectée au LLM ; jusqu’à 200 sujets récents dans le chemin lu | Distinguer sujet proposé, sélectionné et publié ; ne pas transformer les propositions rejetées en succès historiques. |
| `ideas` + sélection du projet | Production du script après choix du premier candidat en auto | Ajouter les scores, leur provenance/version et le choix d’angle/hook sans casser la sélection manuelle. |
| `scripts` + `voices` | Voix et rendu fondés sur le script sélectionné | Relier les affirmations vérifiées au texte final, aux variantes et au plan visuel ; empêcher la validation périmée après édition. |
| `videos` + `youtube_id` | Publication puis actualisation de compteurs | Préserver identité du compte, plateforme, dates, erreurs et idempotence ; ne pas inventer des mesures manquantes. |
| `automations` | Planification, génération, publication et état du dernier passage | Évaluer reprise après crash, concurrence et publications en double ; une reprise aveugle n’est pas sûre. |
| Catégories/expériences/patterns futurs | Apprentissage et décision de prochain contenu | Chaque traitement exige des observations réelles suffisantes, une portée compte et des données persistées. |

Cette matrice est un point de départ. Le nouveau MCD/MCT, puis les migrations et traitements réellement retenus, doivent être cross-validés après l’audit complet.

## Configuration et commandes

- `src/config.ts` lit `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `EDGE_VOICE`, `OUTPUT_DIR`, `N_IDEES`, `LANGUAGE`.
- `server/src/lib/env.ts` lit notamment stockage/chemins, `PORT`, `DB_PATH`, `COOKIE_SECURE`, `TRUST_PROXY`, administration/sessions, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, `PUBLIC_URL`, `YOUTUBE_API_KEY`, `SECRET_KEY`, `PEXELS_API_KEY`, `MUSIC_DIR`, `SFX_DIR`.
- `.env.example` mentionne aussi `GOOGLE_TTS_API_KEY`, `GOOGLE_TTS_VOICE`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `TTS_MONTHLY_LIMIT`. Cet exemple ne liste pas toute la configuration serveur ; auditer les lecteurs réels.
- `loadConfig()` utilise des valeurs de secours en anglais, alors que `.env.example` et les anciennes docs évoquent le français. Ne pas deviner la langue réellement déployée à partir de l’exemple.
- Commande racine disponible : `npm run typecheck`. `tsconfig.json` couvre `src/**/*.ts` et `server/**/*.ts`, pas le frontend.
- Frontend : `npm --prefix web run build`. Ce build ne remplace pas des tests métier ni nécessairement un contrôle TypeScript complet du frontend.
- Aucune commande `test` dans les deux `package.json` lus ; la recherche des fichiers de tests applicatifs n’a trouvé que `src/prompts-test.ts`, qui n’en est pas un. L’agent doit établir l’outillage de test adapté avant les P0.
- `package.json` annonce Node `>=20`, mais `node:sqlite` exige une version compatible plus récente que Node 20. Vérifier l’environnement et les prérequis réellement supportés avant de documenter une version minimale.
- Ne pas exécuter `npm run server`, `npm run gen`, `npm run seed` ni les scripts d’import comme simple validation de l’agent : ce sont des actions applicatives avec effets de bord.

## Écarts et inconnues à ne pas masquer

1. TikTok est la cible métier ; les intégrations repérées sont YouTube. Aucune vérification d’API TikTok, Google Trends, Reddit ou autre source future n’a été effectuée pendant cette installation.
2. Le compteur YouTube de commentaires n’est pas le texte des commentaires. Les taux de complétion, durées regardées et courbes de rétention ne sont pas exposés par le code de stats lu.
3. La découverte constatée repose sur un LLM et la mémoire de sujets ; une liste d’idées n’est pas une mesure de demande ou une veille multi-sources.
4. Les exemples scientifiques du prompt sont des inspirations, pas des sources factuelles déjà validées.
5. Les heuristiques historiques « première seconde décide de tout », durée obligatoire 25–40 s, diagnostic causal des faibles vues ou seuil de rétention garantissant la diffusion ne sont pas des faits démontrés à reprendre.
6. Le lecteur de fichiers a refusé `README.md` comme binaire. Son contenu n’a donc pas été audité ; examiner l’encodage avant de conclure que toute la documentation a été lue.
7. Déploiement réel, éventuels cron système, reverse proxy, accès des fournisseurs, santé de la base et qualité des vidéos : non vérifiés. Le dépôt seul ne prouve pas la configuration d’exploitation.

## État préexistant à respecter

Au début de l’installation : `web/index.html` déjà modifié (+1 ligne) ; plusieurs PNG racine, `_byan-output/` et `assets/` non suivis. Ces changements ne sont pas ceux du nouvel agent. Relire l’état Git au lancement, car il peut évoluer.

`.gitignore` exclut notamment `.opencode/`, `data/`, `.env`, logs et sorties générées. Pour cette raison, l’agent est enregistré dans `opencode.json` et son texte canonique est dans `_byan-output/bmb-creations/tiktok-content-engine/`, afin qu’une future sauvegarde/version du projet puisse inclure ces fichiers sans dupliquer le prompt. Aucun commit n’a été demandé.

Les fichiers `.opencode/agent/byan.md`, `.opencode/agent/croissance-shorts.md` et les anciens contextes sont conservés. Le nouveau cahier des charges est autonome ; il ne dépend pas du chargement de leur personnalité ou de leurs anciennes règles éditoriales.
