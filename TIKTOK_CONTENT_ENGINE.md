# TikTok Content Engine

Document de référence de l'architecture de DANTI_CLIP. Rédigé le 17/09/2026 après l'audit intégral en lecture seule.

Conventions d'état : **EXISTANT** (constaté dans le code), **CIBLE** (architecture visée), **IMPLÉMENTÉ** (code écrit), **TESTÉ** (preuve par test), **BLOQUÉ** (avec motif). Un élément peut être partiel sur plusieurs états ; le statut décrit l'état réel, jamais une intention.

---

## 1. Objectif

DANTI_CLIP est aujourd'hui un générateur de Shorts quasi-automatique : sujet → idées LLM → script → voix → montage → publication YouTube. Le problème constaté : il automatise la production mais pas la décision éditoriale. La sélection automatique prend la première idée (`server/src/routes/workflow.ts:332`), aucun score n'est calculé, aucune performance n'est réutilisée pour choisir le contenu suivant, et les prompts imposent des règles contradictoires avec la stratégie visée (anglais forcé, 25–35 s, boucle obligatoire).

Objectif cible : un système autonome qui découvre des opportunités, les évalue, génère plusieurs angles et hooks, produit la vidéo, mesure les performances réelles et améliore progressivement ses décisions à partir de l'historique de chaque compte. Le critère de réussite est la réponse traçable à : « Quel type de vidéo produire ensuite, pourquoi, avec quel sujet, quel angle, quel hook, quelle structure et quel style visuel, compte tenu de tout ce que mes vidéos précédentes ont appris ? ».

Contraintes directrices : réutiliser l'existant, modularité, configuration des poids, durée adaptative (aucune règle 25–40 s, aucune boucle obligatoire), honnêteté (aucun score présenté comme probabilité de viralité, aucune métrique inventée), préservation des parcours manuels et de la publication YouTube, isolation par compte.

---

## 2. Architecture actuelle

**Stack** : Node.js ≥ 22.12 effectif (package annonce ≥20 ; dépendances verrouillées exigent ≥22.12 — voir §27), TypeScript 5.9, Express 5, SQLite natif `node:sqlite`, React 18 + Vite 7, FFmpeg 7.1.5, Zod 4.

**Découpage** :

- `src/` : moteur de production partagé — `config.ts` (config), `llm/` (abstraction LLM + mock + adaptateur OpenAI-compatible), `prompts.ts` + `prompts-test.ts` (prompts de production, deux familles), `videoTypes.ts` (registre de types), `voice.ts` (Google/Azure/Edge TTS), `images.ts` (Pexels + alignement), `overlays.ts` (highlights), `subs.ts` (ASS), `montage.ts` (FFmpeg), `pipeline.ts` + `index.ts` (CLI).
- `server/src/` : API Express — `index.ts` (montage, sécurité, jobs périodiques, purge), `auth/`, `db/db.ts` (schéma + migrations conditionnelles), `lib/` (env, sérialisation, fonds, musique, SFX, TTS quota, stats YouTube, automatisation), `routes/` (auth, projets, workflow, vidéos, YouTube, automatisation, médias).
- `web/` : SPA React — pages Dashboard, Project (pipeline manuel), Library, Automation, Connections, Settings (vide), Login/Register/Landing.

**Flux réel** : projet (mode auto/manual) → idées LLM (`messagesIdees`, mémoire `user_topics`) → sélection (manuelle, sinon `ideasNow[0]`) → script (`messagesScript`) → validation → voix (`syntheseVoix`, quota Google côté serveur uniquement) → ffprobe → ASS + images Pexels + fond/mascotte/musique/SFX → `rendreVideo` (FFmpeg) → vidéo → conservation ou publication YouTube (OAuth `youtube.upload`).

**Limites structurantes constatées** : aucune évaluation des candidats ; aucune source factuelle conservée ; aucune langue de compte appliquée (anglais imposé par les prompts) ; durée 25–35 s et boucle imposées par les prompts ; statistiques = 3 compteurs écrasés sur `videos` sans historique ; pas de catégories, d'expériences ni de patterns ; anti-répétition = liste de tous les sujets générés (même rejetés), pas un apprentissage.

---

## 3. Architecture cible

### Workflow LLM — ACTUEL avant la refonte (18/09/2026)

| Étape | Provider | Appels |
| --- | --- | --- |
| 10 idées | DeepSeek | 1 |
| Évaluation 13 critères | Gemini | 1 |
| Hooks (top 3 en auto) | DeepSeek | 1–3 |
| Évaluation des hooks | Gemini | 1–3 |
| Sélection finale | Gemini | 1 |
| Script | Gemini | 1 |
| Fact-check | Gemini | 1 (+1 correction) |
| Requêtes images | DeepSeek | 1 |
| **Total** | — | **~9–12** |

Problèmes : Gemini gratuit = 20 req/min + saturation → vidéos en 10+ minutes ; DeepSeek payant ; repli heuristique produisant des scores neutres (faux résultat).

### Workflow LLM — CIBLE (stratégie Groq, validée par Yan le 18/09/2026)

| Étape | Provider | Appels |
| --- | --- | --- |
| 10 idées **+ estimations des 13 critères** (même JSON) | **Groq `openai/gpt-oss-20b`** | 1 |
| Score final (pondérations, pénalités, seuils, dédup, historique, explore/exploit) | **CODE** | 0 |
| Sélection de l'idée | **CODE** | 0 |
| 8–10 hooks **+ estimations des 8 critères** (même JSON) | **Groq `openai/gpt-oss-20b`** | 1 |
| Validation, dédup, règles, score final, choix du hook | **CODE** | 0 |
| Script final structuré | **Groq `openai/gpt-oss-120b`** | 1 |
| Fact-check (verdicts FACT_CONFIRMED / FACT_WITH_NUANCE / UNCERTAIN / FALSE / CONTESTED / NEEDS_REVIEW) | **Groq `openai/gpt-oss-120b`** | 1 (+1 correction) |
| Second opinion (optionnel, `GEMINI_ENABLED=true`, verdicts incertains) | Gemini | 0–1 |
| Requêtes images | Groq 20B | 1 |
| **Total** | — | **~5, dont 4 obligatoires** |

**Hiérarchies de fallback (jamais de faux résultat)** :
- Tâches rapides/massives : Groq 20B → Groq 120B → DeepSeek (si configuré) → `DEFERRED`/`NEEDS_REVIEW`.
- Tâches qualité : Groq 120B → Groq 20B → DeepSeek → Gemini (si activé) → `NEEDS_REVIEW`.

**Règles** : le LLM fournit des **estimations**, le CODE calcule le score final et sélectionne. Aucun score neutre artificiel : sans évaluation fiable, le candidat est `DEFERRED` (non scoré, jamais choisi en auto, jamais publié automatiquement). Le fact-check reste avant la génération vidéo ; jamais de source inventée ; `NEEDS_REVIEW` en cas de doute important. Gestion 429/`retry-after`/quota existante + budget de temps par appel + parallélisme limité. Logging `LLM_USAGE` (provider, modèle, tâche, tokens, durée, coût estimé, fallback).

**Rôles** : GROQ = DEFAULT. DEEPSEEK = SECONDARY / OPTIONNEL (`LLM_SECONDARY_PROVIDER=deepseek`). GEMINI = SPECIALIST / SECOND OPINION / OPTIONNEL (`GEMINI_ENABLED=false` par défaut). Le pipeline fonctionne avec Groq seul.

```
DATA SOURCES (LLM provider + providers optionnels)
   → TOPIC DISCOVERY (opportunités + provenance)
   → TOPIC SCORING (13 critères, poids configurés et versionnés)
   → ANTI-BANALITY (pénalités + angle de second niveau)
   → ANGLE GENERATION (plusieurs angles, sélection)
   → HOOK GENERATION (plusieurs hooks, étape indépendante)
   → HOOK SCORING (8 critères)
   → SCRIPT ENGINE (structure adaptative, langue du compte)
   → FACT CHECK (assertions qualifiées, sources)
   → VISUAL ENGINE (plan visuel par segment)
   → VIDEO ENGINE (montage existant stabilisé)
   → PUBLISHING (YouTube existant ; TikTok conditionné à l'audit app)
   → ANALYTICS (snapshots historisés, métriques réellement disponibles)
   → RETENTION ANALYSIS (conditionnée aux données précises)
   → PERFORMANCE ANALYSIS (rapport structuré par vidéo)
   → LEARNING (agrégats prudents, récence, exploration 80/20)
   → NEXT CONTENT (recommandation traçable)
```

Principes : le moteur éditorial est un ensemble de modules purs (fonctions pures pour scoring/génération) persistés en base, raccordés au `workflow` existant sans remplacer les parcours manuels. Chaque décision (score, sélection, rejet) est persistée avec sa version et sa justification.

---

## 4. Data Flow

| Étape | État | Notes |
| --- | --- | --- |
| Sources | EXISTANT (LLM) / CIBLE (providers optionnels) | Interface `TopicSource` prévue, fonctionnement dégradé si une source tombe |
| Discovery | EXISTANT (idées LLM) | À enrichir : persistance en `topic_candidates` avec provenance |
| Scoring | CIBLE | 13 critères + pénalités, poids configurables, décomposition persistée |
| Selection | EXISTANT manuel / CIBLE auto par score | Le manuel reste prioritaire ; l'auto n'utilise plus `ideasNow[0]` |
| Hooks | CIBLE (étape indépendante) | N variantes scorées, une seule injectée au script |
| Script | EXISTANT | À conformer (durée adaptative, langue) |
| Fact Check | CIBLE | Qualifications FACT/OPINION/HYPOTHESE/APPROXIMATION/CLAIM CONTESTE |
| Visual Planning | EXISTANT partiel | Timings issus des word boundaries ; plan explicite à ajouter |
| Video Generation | EXISTANT | Correctifs lot 1 (graphe audio, concurrence, rejets) |
| Publication | EXISTANT YouTube | TikTok BLOQUÉ (revue d'app requise) |
| Analytics | EXISTANT partiel (3 compteurs) | Snapshots historisés à ajouter |
| Performance Analysis | CIBLE | Rapport structuré, hypothèses non causales |
| Learning | CIBLE | Échantillon minimal, médiane, récence, confiance, exploration |
| Next Content | CIBLE | Recommandation persistée et explicable |

---

## 5. Topic Discovery

- **EXISTANT** : génération de N idées par le LLM (`messagesIdees`), mémoire `user_topics` (200 sujets récents injectés comme interdits). Aucune source externe, aucune mesure de demande.
- **IMPLÉMENTÉ / TESTÉ (lot 3)** : chaque idée générée devient un **candidat persisté** (`topic_candidates`) avec provenance `source=llm`, évaluée sur les 13 critères et scorée. Le repli heuristique (anti-banalité) fonctionne si l'évaluateur échoue.
- **CIBLE** : couche `TopicSource` (interface TypeScript : `id`, `fetchOpportunities(ctx)`), première implémentation = le LLM actuel (source `llm`). Autres sources (Google Trends, Reddit, TikTok research, Wikipédia) ajoutables sans toucher au cœur. Le moteur continue si une source échoue (erreur isolée par source, log dédié).

## 6. Topic Scoring

- **IMPLÉMENTÉ / TESTÉ (lot 3)** : score pondéré configurable (`src/content-engine/config.ts` + `scoring.ts`) : 11 critères positifs pondérés (somme normalisée à 1), `saturation` et `banality` en pénalités, 5 drapeaux de pénalité (trop connu, faible visuel, trop générique, difficile à démontrer, crédibilité insuffisante), seuils de rejet automatique, score final borné 0..1. Évaluation par le LLM (`evaluator.ts`, une réponse pour tout le lot, validée Zod) avec repli heuristique (`anti-banality.ts`).
- Formule : `total = clamp(Σ(critère_i × poids_i) − pénalités, 0, 1)` (les astérisques ambigus de la phase 4 sont explicités et versionnés).
- Chaque sous-score est persisté ; `score_version` et le JSON de décomposition (positive, pénalités, raisons, justification) permettent de rejouer et d'auditer. Les poids évolueront via le Learning (échantillon minimal), jamais par mutation manuelle non tracée.
- Un score éditorial n'est **pas** une probabilité de viralité : c'est un classement relatif de critères explicites.

## 7. Hook Engine

- **IMPLÉMENTÉ / TESTÉ (lot 4)** : étape indépendante du script. Pour le candidat sélectionné : génération de `variantsPerTopic` variantes (défaut 6) réparties sur les 7 patterns du contrat (`curiosity_gap`, `experience`, `contradiction`, `question`, `unexpected_consequence`, `mystery`, `specific_phenomenon`), évaluation sur les 8 critères, persistance dans `hooks`, sélection du meilleur non rejeté, injection **verbatim** dans la génération du script (`FIXED HOOK`, les deux familles de prompts). Liaisons : `hooks.topic_candidate_id`, `scripts.hook_id`, `videos.hook_id`.
- Contrôles : pas de « Saviez-vous que », phrase ≤ 12 mots, réponse jamais donnée d'avance, promesse tenue par le script, pas de clickbait. Replis : sans candidat → script sans hook fixe (comportement historique) ; LLM en échec → scores neutres documentés ; génération en échec → script sans hook fixe, log d'erreur.

## 8. Script Engine

- **EXISTANT** : structure hook / problème / explication / twist / révélation / payoff, narration continue, titre/description/hashtags.
- **IMPLÉMENTÉ / TESTÉ (lot 2)** : contraintes contradictoires supprimées des deux familles de prompts (anglais forcé, 25–35 s, boucle, opener « Your/You ») ; durée adaptative demandée explicitement ; langue pilotée par le paramètre `language` ; règles d'honnêteté (pas de statistiques inventées, pas d'absolus injustifiés, hook fidèle au contenu) et éditoriales (pas de « Saviez-vous que », payoff non-gimmick, pas de remplissage) ajoutées. Verrouillé par `tests/prompts.contract.test.ts`.

## 9. Fact Checking

- **IMPLÉMENTÉ (v1, lot 8)** : avant la génération finale, le juge extrait 3–6 affirmations critiques du script et les qualifie (FACT / OPINION / HYPOTHESE / APPROXIMATION / CLAIM CONTESTE, avec la variante `non_verifiable`). Une affirmation contestée **bloque** : correction du script avec feedback (max `factCheck.maxCorrections`, défaut 1), puis rejet explicite + événement `FACT_CHECK_FAILED` si toujours contesté. Le fact-check indisponible (erreur juge) accepte le script en le signalant — jamais de blocage silencieux des faits, jamais de vidéo fausse publiée. Grounding Google Search prévu (adaptateur Gemini), limité par le quota du compte.
- **CIBLE (P1)** : sources conservées avec le sujet, recherche active de sources fiables, détection de statistiques douteuses renforcée.

## 10. Visual Engine

- **EXISTANT** : segmentation de la narration, alignement sur les word boundaries, images Pexels scorées lexicalement, fond, mascotte, overlays (highlights hook/chute/chiffres), sous-titres ASS (5 styles + karaoké), micro-séquences via le timing des boundaries.
- **CIBLE** : plan visuel explicite par segment (image/vidéo/animation/diagramme/texte/transition/motion), timings générés automatiquement comme aujourd'hui, avec possibilité d'annoter les segments script par type d'élément. Ne pas reproduire le modèle « voix + image stock + zoom lent » : les capacités existantes (karaoké, gros hook, effets) sont conservées et pilotées par le plan.

## 11. Video Engine

- **EXISTANT** : `rendreVideo` (1080×1920, H.264, yuv420p, 30 fps, AAC 192k, CRF 23, ducking musique, SFX positionnés).
- **IMPLÉMENTÉ / TESTÉ (lot 1)** : sortie audio `[base]` désormais mappée quand `sfx` est vide ou désactivé (test d'intégration FFmpeg réel `tests/montage.audio.test.ts` — échouait avant correctif, code 234 « output unconnected ») ; rejets des jobs vidéo/full capturés avec état `error` visible (`tests/workflow.routes.test.ts`) ; verrou 409 par projet contre les rendus concurrents ; décision pure de régénération script/voix (`decideRegeneration`, `tests/workflow.decide.test.ts`) ; sélection d'idée réinitialise script/voix ; génération de script réinitialise la voix ; réponses LLM validées par Zod (`src/llm/schemas.ts`, `tests/llm.schemas.test.ts`).

## 12. Publishing

- **EXISTANT** : YouTube (OAuth 2.0 `youtube.upload`, upload multipart, BYOK chiffré AES-256-GCM, `#shorts` ajouté, catégorie 27, privacy par défaut `unlisted`, idempotence absente : une même vidéo peut être re-téléversée).
- **CIBLE** : conserver YouTube et préserver les parcours manuels/automatiques. Ajouter l'anti-duplication de publication (une vidéo publiée ne se re-publie pas).
- **TikTok** : **aucun connecteur n'existe** (le nom du projet n'implique rien). Contrat officiel vérifié (2026) : Content Posting API, compte développeur + revue manuelle de l'app ; avant audit : visibilité SELF_ONLY, compte privé, ~5 utilisateurs/24 h ; après audit : plafonds de publication (~15 posts/jour/créateur), `creator_info/query` obligatoire avant chaque post, UX imposée, flag `is_aigc` pour le contenu IA. **BLOQUÉ en P3** : nécessite la revue d'app TikTok et des décisions de Yan ; l'interface d'intégration sera construite proprement en attendant.

## 13. Analytics

- **EXISTANT** : YouTube Data API `videos.list?part=statistics` (clé API, lots de 50, timeout 10 s, fraîcheur 5 h) → `videos.views/likes/comments` écrasés sans historique. Contrat officiel : ces trois compteurs uniquement (plus `dislikeCount` privé, `favoriteCount` déprécié). Révision officielle août 2026 : `viewCount` compte désormais un démarrage de lecture dès le premier frame pour tous les formats ; les « vues engagées » ne sont disponibles que dans YouTube Analytics.
- **IMPLÉMENTÉ / TESTÉ (lot 6)** : snapshots historisés dans `video_stats` à chaque refresh (`views/likes/comments` bruts, absents = null, jamais de faux zéro) ; les colonnes `videos.*` restent mises à jour pour compatibilité UI (comportement historique : vues absentes → 0). Vidéo absente de la réponse → `stats_status='missing'`, pas de snapshot. Taux dérivés purs (`src/content-engine/analytics.ts`) : `like_rate = likes/views` si `views > 0` sinon null ; moyenne/médiane robustes aux absents. Événement `ANALYTICS_UPDATED`. Pas de complétion, de watch time, de rétention, de shares/saves ni de source de trafic via cette API — à documenter comme intégrations nécessaires (YouTube Analytics API + éventuelles plateformes futures).

## 14. Retention Analysis

- **CIBLE conditionnée** : analyse de courbes de rétention **uniquement si** des données suffisamment précises deviennent disponibles (YouTube Analytics API, OAuth chaîne). Détection des zones de rupture ; diagnostics probabilistes parmi TOPIC_FAILURE, HOOK_FAILURE, PACING_FAILURE, VISUAL_FAILURE, SCRIPT_FAILURE, PAYOFF_FAILURE, LOW_CREDIBILITY, LOW_SHAREABILITY, LOW_COMMENTABILITY — toujours avec niveau de confiance et sans causalité affirmée.
- **BLOQUÉ pour les données** : l'intégration actuelle n'expose aucune courbe de rétention ; aucune ne sera inventée à partir de vues/likes/commentaires.

## 15. Performance Analysis

- **CIBLE** : après publication et collecte, rapport structuré par vidéo (sujet, catégorie, hook, durée, métriques, comparaison à la portée compte/plateforme et maturité comparables, hypothèses avec confiance, recommandations). Deux publications organiques ne constituent pas un A/B ; le rapport le dit explicitement.

## 16. Learning System

- **IMPLÉMENTÉ / TESTÉ (lot 7)** : observations = dernier snapshot `video_stats` par vidéo + dimensions du contenu (catégorie via `video_categories`, pattern de hook via `hooks.pattern`, durée via `videos.duration`). Agrégats par dimension : taille d'échantillon, médiane et moyenne de vues, taux d'engagement moyens, **confiance = min(1, échantillon / minSampleSize)** ; fenêtre de récence configurable. Recommandation : `exploit` du meilleur pattern mesuré ou `explore` (tirage configurable, ou échantillon insuffisant → exploration explicable). Persistée dans `content_decisions` (JSON complet), événement `LEARNING_UPDATED`, endpoint `GET /api/content-engine/recommendation`. Aucun langage causal (verrouillé par test) ; les performances peuvent changer dans le temps (fenêtre de récence).

## 17. Experimentation / A-B Testing

- **CIBLE** : une variable testée à la fois lorsque possible (hook, durée, style visuel, voix, vitesse, sous-titres, structure, catégorie, angle, rythme). Tables `experiments` + assignations par vidéo, historique conservé. Limites exposées : publication organique ≠ randomisation, différences de contexte (date, heure, distribution) documentées.

## 18. Content Categories

- **IMPLÉMENTÉ / TESTÉ (lot 7)** : familles seedées (body, psychology, animals, space, everyday_science, tech, weird_history, dangerous_science, human_behavior, nature), **multi-catégories** par candidat (classification par l'évaluateur, `topic_categories`) et copiées sur la vidéo au rendu (`video_categories`) — contrairement au `category_id` unique de l'exemple. Agrégats avec taille d'échantillon minimale : une catégorie n'est jamais déclarée « meilleure » sur très peu de données.

## 19. Database schema

**EXISTANT** : 12 tables (`users`, `sessions`, `projects`, `ideas`, `scripts`, `voices`, `videos`, `youtube_tokens`, `youtube_creds`, `user_topics`, `tts_usage`, `automations`) — détail complet dans le rapport d'audit. Limites : pas de FK sur `selected_*`, pas de provenance vidéo→script/voix, pas d'historique stats, migrations conditionnelles sans versionnement.

**CIBLE (additif, migrations non destructives)** — dictionnaire :

| Table | Champs principaux | Portée |
| --- | --- | --- |
| `topic_candidates` | `id`, `user_id`, `title`, `description`, `idea_text`, `angle`, `source`, `source_url`, 13 scores (`demand`, `curiosity`, `emotional_impact`, `novelty`, `visual`, `comment`, `share`, `search`, `audience_relevance`, `credibility`, `saturation`, `banality`, `follow_up`), `total_score`, `score_version`, `score_detail` (JSON), `status` (candidate/selected/rejected/used), `created_at` | compte |
| `hooks` | `id`, `topic_candidate_id`, `hook_text`, `pattern`, 8 scores (`curiosity`, `clarity`, `specificity`, `surprise`, `emotional_impact`, `open_loop`, `credibility`, `scroll_stopping`), `total_score`, `score_version`, `status`, `created_at` | compte (via candidat) |
| `categories` | `id`, `slug` UNIQUE, `label`, `description`, `created_at` | global |
| `topic_categories` | `(topic_candidate_id, category_id)` PK composite | compte (via candidat) |
| `video_categories` | `(video_id, category_id)` PK composite | compte (via vidéo) |
| `video_stats` | `id`, `video_id`, `views/likes/comments` NULLables, `source`, `captured_at` | compte (via vidéo) |
| `experiments` | `id`, `user_id`, `experiment_type`, `variable`, `variant_a`, `variant_b`, `status`, `created_at`, `completed_at` | compte |
| `experiment_assignments` | `id`, `experiment_id`, `video_id`, `variant` | compte |
| `performance_patterns` | `id`, `user_id`, `category`, `hook_pattern`, `duration_range`, `visual_style`, `topic_type`, `sample_size`, `average_views`, `median_views`, `average_completion`, `average_watch_time`, `average_comments`, `average_shares`, `confidence`, `updated_at` | compte |
| `content_series` | `id`, `user_id`, `name`, `description`, `style`, `created_at` | compte |
| `series_episodes` | `id`, `series_id`, `video_id`, `position` | compte |
| `content_decisions` | `id`, `user_id`, `decision_json` (recommandation traçable), `created_at` | compte |

**Migrations** : ajout de colonnes `topic_candidate_id`, `hook_id` (nullable) sur `videos` pour relier performances aux caractéristiques. Cross-validation MCD ⇄ MCT : chaque donnée sert un traitement listé dans ce document ; les 13 + 8 critères sont tous persistés (l'exemple de schéma de la phase 15 n'est pas limitatif).

## 20. API endpoints

**EXISTANT** (sélection) : `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `POST /api/projects/:id/{ideas,select-idea,script,validate-script,voice,style,background,video,full}`, `PATCH /api/projects/:id/render-options`, `GET /api/projects/:id/video/status`, `GET /api/voices`, `GET/POST/DELETE /api/videos*`, `GET/POST /api/backgrounds*`, mascotte, musique, SFX, `GET/POST/DELETE /api/youtube/*`, `GET/POST/PATCH/DELETE /api/automation/*`, auth.

**IMPLÉMENTÉ / TESTÉ** : `GET /api/content-engine/config` (poids effectifs, seuils, exploration), `GET /api/content-engine/recommendation` (recommandation traçable persistée dans `content_decisions`).

**CIBLE** : `GET /api/content-engine/topic-candidates`, endpoints d'agrégats dashboard (P1), gestion manuelle des candidats/hooks (P1). Aucune route existante supprimée.

## 21. Background jobs

**EXISTANT** : au démarrage : purge des vidéos non gardées puis toutes les heures ; tick d'automatisation puis chaque minute ; refresh stats 60 s après démarrage puis toutes les 6 h. Attention : démarrer le serveur a des effets réels (purge, générations programmées) — jamais pour tester.

**CIBLE** : conserver les ticks ; ajouter un job de maintenance du moteur (re-scoring périodique, agrégats de patterns, nettoyage d'expériences) avec idempotence et reprise après crash (l'automatisation actuelle consomme le créneau avant exécution : une reprise aveugle n'est pas sûre — correctif en lot 1/P1).

## 22. Configuration

**EXISTANT** : `.env` (LLM_PROVIDER, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, EDGE_VOICE, OUTPUT_DIR, N_IDEES, LANGUAGE, GOOGLE/AZURE TTS, PEXELS_API_KEY, YOUTUBE_*, MUSIC_DIR, SFX_DIR, TTS_MONTHLY_LIMIT, etc.).

**IMPLÉMENTÉ / TESTÉ (lot 5)** : configuration du moteur centralisée (`src/content-engine/config.ts`) : `topicScoring` (poids, pénalités, seuils de rejet), `hookScoring` (poids, seuil, `variantsPerTopic`), `explorationRate`, `learning.minSampleSize` / `recencyWindowDays`. Défauts versionnés + surcharge JSON via `CONTENT_ENGINE_CONFIG` (fusion profonde validée, défauts si fichier invalide — le moteur ne s'arrête pas) + endpoint `GET /api/content-engine/config`. Les poids restent modifiables sans toucher au code.

## 23. Error handling

**EXISTANT** : `ApiError`, `asyncHandler`, middleware d'erreurs (cache les messages ≥500), taux HTTP structurés. Lacunes : callbacks Multer non raccordés, pas de timeout LLM/FFmpeg de rendu, pas de fallback fournisseur voix, 403 YouTube systématiquement lu « quota ».

**IMPLÉMENTÉ (lots 1–7)** : rejets des jobs vidéo/full capturés avec état `error` visible ; verrou 409 par projet ; validation Zod de toute réponse LLM avant écriture ; replis documentés (évaluation LLM → heuristiques, hooks → scores neutres, génération → script sans hook fixe) ; erreurs visibles, aucun workflow arrêté silencieusement.

**CIBLE (P1)** : retries avec exponential backoff sur les appels réseau (LLM, stats), timeout applicatifs, fallback providers voix, pas de double publication lors d'une reprise (automatisation).

## 24. Logging

**EXISTANT** : `console.log/error` avec préfixes `[server]`, `[db]`, `[video]`, `[automation]`, `[ytstats]`…, `automations.last_result` JSON.

**IMPLÉMENTÉ / TESTÉ (lot 5)** : logger structuré JSON (`src/content-engine/logging.ts`) avec les 14 événements du contrat ; récepteur injectable (tests). Événements émis dans les flux réels : TOPIC_DISCOVERED, TOPIC_REJECTED (raisons), TOPIC_SELECTED (auto/manuel), HOOK_GENERATED, HOOK_REJECTED, SCRIPT_GENERATED, VIDEO_GENERATED, VIDEO_PUBLISHED, ANALYTICS_UPDATED (lot 6), LEARNING_UPDATED (lot 7). FACT_CHECK_FAILED, PERFORMANCE_ANALYZED, EXPERIMENT_* à leurs lots P1/P2. Aucun secret ni donnée personnelle dans les logs (identifiants numériques uniquement).

## 25. Future improvements

Connecteur TikTok post-audit ; sources de discovery externes ; YouTube Analytics (rétention réelle) ; éditeur visuel du plan ; embeddings pour anti-duplication sémantique ; séries complètes ; multilingue par compte ; supervision/alerting des jobs ; CI + tests de bout en bout synthétiques.

## 26. Implementation roadmap

| Lot | Contenu | Priorité | Statut |
| --- | --- | --- | --- |
| 0 | `TIKTOK_CONTENT_ENGINE.md` + harnais de test (`node:test` via tsx, base temporaire, routeurs sans démarrage serveur) | P0 | TESTÉ : 34 tests verts, `npm test` |
| 1 | Correctifs pipeline : graphe audio SFX, rejets jobs, verrou par projet, validation LLM, cohérence thème/script/voix | P0 | TESTÉ : `montage.audio`, `workflow.decide`, `workflow.routes`, `llm.schemas` |
| 2 | Prompts conformes (langue du compte, durée adaptative, pas de boucle imposée, règles éditoriales) | P0 | TESTÉ : `prompts.contract` |
| 3 | Topic Engine : tables, scoring 13 critères configurable, anti-banalité, angles, raccordement workflow | P0 | TESTÉ : 16 tests (scoring, anti-banality, evaluator, content-engine.db, route /ideas) |
| 4 | Hook Engine : N variantes, 8 critères, sélection, injection script | P0 | TESTÉ : 8 tests hooks + persistance + parcours mock complet |
| 5 | Config `content_engine` + logs structurés (14 événements) | P0 | TESTÉ : 10 tests (config, logging, endpoint, émissions) |
| 6 | Analytics : snapshots `video_stats`, taux dérivés, refresh | P0 | TESTÉ : 9 tests (snapshots, historique, nulls, missing, événement) |
| 7 | Learning + recommandation traçable + exploration 80/20 | P0 | TESTÉ : 11 tests (agrégats, recence, exploration, endpoint, categories) |
| 8 | Flux multi-fournisseurs (DeepSeek generator + Gemini juge), top-K hooks, sélection finale par le juge, fact-check v1 | P0 | TESTÉ : 21 tests ajoutés (final-selection, fact-check, llm-multi, workflow.multi) — total 124 |
| 8b | Brancher la recommandation sur l'automatisation (la boucle decide le contenu suivant) — revue BYAN M3 | P1 | planifié |
| 9 | Dashboard analytique (overview, topics, hooks, visuels, expériences, learning) | P1 | planifié |
| 9 | A/B testing + expériences | P1 | planifié |
| 10 | Fact checking + sources | P1 | planifié |
| 11 | Comment-driven content + séries | P2 | planifié |
| 12 | Connecteur TikTok | P3 (BLOQUÉ : revue d'app TikTok) | planifié |
| 13 | Sources discovery externes (Trends, Reddit, etc.) | P2 | planifié |

Note (lot 1) : correctifs de sécurité transversaux issus de l'audit (CSRF sensible à la casse, isolation musique/SFX par compte, rate-limit, suppressions disque) restent à traiter dans un lot dédié, en parallèle du moteur.

Critère d'achèvement P0 : la boucle discovery → scoring → hooks → script → production → analytics → apprentissage est raccordée de bout en bout sur des données synthétiques, testée, et la recommandation « prochaine vidéo » est persistée et explicable. Chaque lot liste fichiers à créer/modifier, impact, données et critères de réussite avant démarrage.

## 27. Technical decisions

1. **Tests** : `node:test` natif exécuté via `node --import tsx --test "tests/*.test.ts"` (aucune dépendance ajoutée). TDD : chaque correctif a un test qui échouait avant. Tests d'intégration réels avec FFmpeg quand pertinent (le bug du graphe est vérifié par un vrai rendu synthétique). Aucun test ne publie, ne paie, n'utilise de vraies clés. Base SQLite temporaire par test (`closeDb()` entre tests).
2. **Rasoir d'Ockham** : aucune réécriture ; le scoring et les hooks s'insèrent dans `workflow.ts` existant. Les modules purs (scoring, anti-banalité) sont testables sans réseau.
3. **Scoring** : formule additive avec pénalités, versionnée ; les sous-scores sont persistés ; un score est un classement éditorial, jamais une probabilité de viralité.
4. **Portée par compte** : tous les nouveaux modèles sont rattachés à `user_id` (via le candidat/vidéo) ; les bibliothèques musique/SFX globales actuelles seront isolées par compte (défaut d'audit).
5. **Langue** : résolue par configuration réelle (compte), jamais imposée ; l'anglais forcé des prompts est un bug à corriger, pas une stratégie. **IMPLÉMENTÉ (lot 2)** : les prompts obéissent au paramètre `language`.
6. **Durée** : adaptative au sujet ; la règle 25–35 s et la boucle obligatoire sont supprimées des prompts. **IMPLÉMENTÉ (lot 2)**.
7. **Node effectif** : **CORRIGÉ** — `package.json` exige désormais `>=22.12.0` (dépendances verrouillées).
8. **Migrations** : additives et idempotentes sur le mécanisme conditionnel existant, sans table de version pour l'instant (P1 : versionnement).
9. **TikTok** : pas de promesse avant vérification ; l'intégration est documentée comme cible avec les contraintes officielles d'audit.
10. **Aucune donnée inventée** : données absentes = null + statut `missing`, jamais zéro implicite.
11. **Validation LLM** : **IMPLÉMENTÉ** — toute réponse LLM (idées, script, requêtes images, évaluations, hooks) passe par `parseLlmJson` (Zod) avant écriture en base ou envoi TTS ; erreur explicite sinon.
12. **Revue BYAN (17/09/2026)** : aucun bloquant. Correctifs intégrés : seuil `minTotalScore` effectif (M1), archivage des candidats périmés lors d'une régénération d'idées (M2), langue par compte et par règle d'automatisation (M4), vues absentes = null (fini les faux zéros), justification des hooks persistée, minimum de variantes de hooks, exploration proposant les dimensions les moins explorées, comptage par vidéos uniques dans les agrégats, renommage du libellé audio FFmpeg, bornes de durée explicites. Reste en P1 : brancher la recommandation sur l'automatisation (M3), retries/backoff, dashboard, A/B.
13. **Flux multi-fournisseurs (17/09/2026)** : `LLM_PROVIDER=multi` → **generator = DeepSeek** (`deepseek-flash`, discovery + hooks), **judge = Gemini** (`gemini-3.8-flash`, évaluation 13 critères, évaluation des hooks, sélection finale structurée, script, fact-check). Hooks générés pour le **top K** des candidats (défaut 3, configurable `selection.topKCandidates`), sélection finale par le juge avec repli déterministe sur le meilleur score. **Fact-check v1 (phase 11)** : extraction des affirmations critiques, 5 qualifications (FACT/APPROXIMATION/HYPOTHESE/CONTESTE/NON_VERIFIABLE), une affirmation contestée bloque → correction du script (feedback) puis rejet explicite + `FACT_CHECK_FAILED` après `maxCorrections`. Grounding Google Search prévu dans l'adaptateur Gemini (nécessite un compte facturé). Testé : 124 tests. **État des clés au 17/09** : DeepSeek répond 402 (solde à créditer), Gemini répond 200 (le grounding est limité par quota).

## 28. Risks and limitations

- **Risque produit** : sur-optimisation d'une seule métrique → mitigé par l'analyse multidimensionnelle et l'exploration configurable.
- **Risque éditorial** : LLM halluciné → fact-checking et qualifications en P1 ; en attendant, les prompts exigent des faits prudents et vérifiables.
- **Risque plateforme** : changements de quotas/comptage YouTube (août 2026) et règles TikTok ; à surveiller.
- **Risque de données** : peu de vidéos publiées → le learning reste exploratoire jusqu'à des échantillons suffisants ; jamais de causalité affirmée.
- **Limites connues** : rétention/watch time indisponibles sans YouTube Analytics ; texte des commentaires non accessible via l'intégration actuelle ; TikTok dépend d'une revue d'app externe ; qualité réelle des rendus non validée en production pendant l'audit.
- **Déploiement réel, configuration d'exploitation, base de production** : non inspectés pendant l'audit (`.env` et données réelles non lus).

---

## Registre de traçabilité des 36 phases

| Phase | Statut |
| --- | --- |
| 1 Audit intégral | TESTÉ partiel : lecture exhaustive + typechecks + repro FFmpeg ; déploiement réel non inspecté |
| 2 Doc 28 sections | en cours (ce document) |
| 3 Topic Discovery | IMPLÉMENTÉ (candidats persistés, source=llm) + CIBLE providers externes (P1/P2) |
| 4 Topic Scoring | IMPLÉMENTÉ/TESTÉ (13 critères, pénalités, rejets, versionné) |
| 5 Anti-banality | IMPLÉMENTÉ/TESTÉ (heuristiques + seuils) |
| 6 Angles | partiel : angle généré par les idées ; génération multi-angles dédiée en P1 |
| 7 Hook Engine | IMPLÉMENTÉ/TESTÉ (lot 4) |
| 8 Hook Scoring | IMPLÉMENTÉ/TESTÉ (8 critères, seuil) |
| 9 Script adaptatif | planifié lot 2 |
| 10 Secondary open loops | planifié lot 2/4 |
| 11 Fact checking | IMPLÉMENTÉ v1 (lot 8 : qualifications, blocage, correction) — sources/grouding renforcé en P1 |
| 12 Visual Engine | planifié P1 (amélioration du plan) |
| 13 Identité visuelle | planifié P1 |
| 14 Content families | IMPLÉMENTÉ/TESTÉ (lot 7 : seed, classification, multi-catégories, agrégats prudents) |
| 15 Database | IMPLÉMENTÉ (tables et colonnes des lots 3–7, migrations additives idempotentes) |
| 16 Analytics | IMPLÉMENTÉ/TESTÉ (lot 6 : snapshots, taux dérivés, événement) |
| 17 Retention | BLOQUÉ : nécessite YouTube Analytics API |
| 18 Performance analysis | partiel : agrégats learning (lot 7) ; rapport structuré par vidéo en P1 |
| 19 Learning | IMPLÉMENTÉ/TESTÉ (lot 7) |
| 20 A/B testing | planifié lot 9 (P1) |
| 21 Comment-driven | planifié lot 11 (P2) — nécessite lecture des commentaires |
| 22 Séries | planifié lot 11 (P2) |
| 23 Positionnement | IMPLÉMENTÉ (lot 2 : prompts orientés curiosité + angle de second niveau) |
| 24 Exemples de sujets | intégrés aux tests du scoring (inspiration, pas liste fixe) |
| 25 Dashboard | planifié lot 8 (P1) |
| 26 Pipeline centralisé | EXISTANT (workflow + automatisation) ; raccordement IMPLÉMENTÉ (lots 3–4 : scoring, hooks) |
| 27 Configuration | IMPLÉMENTÉ/TESTÉ (lot 5) |
| 28 Logging | IMPLÉMENTÉ/TESTÉ (lot 5, événements câblés au fil des lots) |
| 29 Error handling | partiel : lot 1 (rejets, verrou, validation LLM) ; retries/backoff P1 |
| 30 Duplication/répétition | partiel : mémoire `user_topics` + anti-banalité ; similarité sémantique en P1 |
| 31 Diversité | IMPLÉMENTÉ/TESTÉ (lot 7 : exploration configurable) |
| 32 Priorités P0/P1/P2/P3 | établi (§26) |
| 33 Optimisation multidimensionnelle | IMPLÉMENTÉ (agrégats vues + engagement, confiance, récence ; pas de vues seules) |
| 34 Règles éditoriales | IMPLÉMENTÉ/TESTÉ (lot 2 : prompts, verrouillé par tests) |
| 35 Objectif final | IMPLÉMENTÉ en P0 : boucle complète raccordée, recommandation persistée (§16) |
| 36 10 étapes finales | FAIT : bilan technique complet livré à Yan le 17/09/2026 |
