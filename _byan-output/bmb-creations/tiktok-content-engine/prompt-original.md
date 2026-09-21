Tu es un ingénieur logiciel senior spécialisé en automatisation de contenu, systèmes IA, data, analytics, génération vidéo et optimisation de contenu court.

Je possède déjà une application complète qui automatise la création de vidéos TikTok sur des sujets scientifiques, faits étonnants, psychologie, animaux, espace, technologie, phénomènes du quotidien, etc.

Le pipeline de base fonctionne déjà : recherche de sujets → génération du script → génération voix/visuels → montage vidéo → vidéo finale.

Le problème n’est PAS que je ne sais pas produire les vidéos.

Le problème est que les vidéos obtiennent généralement peu de vues, souvent autour de quelques centaines de vues, et que mon système actuel automatise surtout la PRODUCTION mais pas suffisamment la SÉLECTION DES SUJETS, le PACKAGING, les HOOKS, l’ANALYSE DES PERFORMANCES et l’APPRENTISSAGE DU SYSTÈME.

L’objectif est donc de transformer mon projet existant en une véritable MACHINE D’OPTIMISATION DE CONTENU.

Le principe général doit devenir :

RESEARCH
→ TOPIC DISCOVERY
→ TOPIC SCORING
→ TOPIC SELECTION
→ HOOK GENERATION
→ HOOK SCORING
→ SCRIPT GENERATION
→ FACT CHECKING
→ VISUAL PLANNING
→ VIDEO GENERATION
→ PUBLICATION
→ ANALYTICS
→ PERFORMANCE ANALYSIS
→ LEARNING
→ ADAPTATION DU PROCHAIN CONTENU

Je veux que le système apprenne progressivement ce qui fonctionne pour MON compte et mon audience.

IMPORTANT :

* Ne reconstruis pas inutilement ce qui fonctionne déjà.
* Commence par analyser intégralement le code existant.
* Identifie l’architecture actuelle, les technologies utilisées, les points d’entrée, les services, les bases de données, les API, les workflows, les tâches cron, les composants frontend/backend et le système de génération vidéo existant.
* Réutilise au maximum l’existant.
* Ne remplace une partie existante que si cela apporte une amélioration concrète.
* Le nouveau système doit être modulaire.
* Tout ce qui est important doit être configurable.
* L’architecture doit pouvoir évoluer sans devoir réécrire l’application.
* Préserve la compatibilité avec les fonctionnalités existantes.
* Évite les abstractions inutiles.
* Écris du code réellement exploitable en production.
* Ajoute gestion des erreurs, logs, validation, retries et fallback lorsque pertinent.
* Ne fais pas semblant qu’une métrique ou une API existe : vérifie les possibilités réelles du projet avant d’implémenter.
* Lorsque certaines fonctionnalités nécessitent une API externe ou une donnée qui n’est pas actuellement disponible, documente clairement le besoin et construis une interface d’intégration propre.

==================================================
PHASE 1 — ANALYSE COMPLÈTE DU PROJET
====================================

Avant de modifier le code, analyse le projet entier.

Je veux comprendre :

1. Structure des dossiers
2. Stack technique
3. Frontend
4. Backend
5. Base de données
6. Services externes
7. APIs utilisées
8. Système de génération vidéo
9. Système de génération de texte
10. Système de génération de voix
11. Système de recherche de sujets
12. Système de publication
13. Système de stockage
14. Système de logs
15. Cron/jobs/workers
16. Gestion des erreurs
17. Configuration via variables d’environnement
18. Modèles de données actuels
19. Dashboard existant
20. Points susceptibles d’être améliorés

Trouve également les fonctions/classes/services déjà présents pouvant être réutilisés.

Ne commence pas directement par modifier 50 fichiers.

Commence par comprendre le système.

==================================================
PHASE 2 — CRÉER UNE DOCUMENTATION MARKDOWN
==========================================

Crée à la racine du projet un document :

TIKTOK_CONTENT_ENGINE.md

Ce document doit devenir la documentation de référence de la nouvelle architecture.

Il doit contenir au minimum les sections suivantes :

# TikTok Content Engine

## 1. Objectif

Décrire précisément le passage d’un simple générateur de vidéos à un système autonome d’optimisation de contenu.

## 2. Architecture actuelle

Documenter le système existant.

## 3. Architecture cible

Décrire le nouveau système.

## 4. Data Flow

Présenter le flux complet :

Sources
→ Discovery
→ Scoring
→ Selection
→ Hooks
→ Script
→ Fact Check
→ Visual Planning
→ Video Generation
→ Publication
→ Analytics
→ Performance Analysis
→ Learning

## 5. Topic Discovery

## 6. Topic Scoring

## 7. Hook Engine

## 8. Script Engine

## 9. Fact Checking

## 10. Visual Engine

## 11. Video Engine

## 12. Publishing

## 13. Analytics

## 14. Retention Analysis

## 15. Performance Analysis

## 16. Learning System

## 17. Experimentation / A-B Testing

## 18. Content Categories

## 19. Database schema

## 20. API endpoints

## 21. Background jobs

## 22. Configuration

## 23. Error handling

## 24. Logging

## 25. Future improvements

## 26. Implementation roadmap

## 27. Technical decisions

## 28. Risks and limitations

Le Markdown doit être suffisamment détaillé pour qu’un autre développeur ou une autre IA puisse reprendre le projet et comprendre exactement comment fonctionne le système.

==================================================
PHASE 3 — TOPIC DISCOVERY ENGINE
================================

Le système ne doit plus fonctionner comme :

« Trouve-moi des facts intéressants. »

Il doit chercher des OPPORTUNITÉS DE CONTENU.

L’objectif est de trouver des sujets qui ont plusieurs caractéristiques :

* curiosité élevée
* potentiel de rétention
* surprise
* valeur informationnelle
* potentiel visuel
* potentiel de commentaires
* potentiel de partage
* potentiel de recherche
* nouveauté
* faible banalité
* possibilité de créer une suite
* possibilité de créer plusieurs angles
* lien avec une expérience quotidienne
* contradiction avec une intuition commune

Le système doit idéalement pouvoir utiliser plusieurs types de sources lorsque disponibles :

* recherche TikTok
* recherches de sujets
* données de recherche
* Google Trends
* YouTube
* Reddit
* actualités
* bases de connaissances scientifiques
* Wikipedia
* sources spécialisées
* autres sources pertinentes disponibles via API

Ne dépends pas obligatoirement de toutes ces sources.

Construis une couche de “Source Provider” permettant d’ajouter ou supprimer facilement une source.

Exemple conceptuel :

TopicSource
→ TikTokSource
→ TrendsSource
→ RedditSource
→ NewsSource
→ ScientificSource

Le système doit pouvoir fonctionner même si une source tombe en panne.

==================================================
PHASE 4 — TOPIC SCORING ENGINE
==============================

Chaque sujet découvert doit être automatiquement évalué.

Créer un système de scoring configurable.

Le score doit prendre en compte au minimum :

* demand
* curiosity
* emotionalImpact
* novelty
* visualPotential
* commentPotential
* sharePotential
* searchPotential
* audienceRelevance
* credibility
* saturation
* banality
* followUpPotential

Exemple de logique :

score =
demand * weightDemand

* curiosity * weightCuriosity
* emotionalImpact * weightEmotionalImpact
* novelty * weightNovelty
* visualPotential * weightVisualPotential
* commentPotential * weightCommentPotential
* sharePotential * weightSharePotential
* searchPotential * weightSearchPotential
* audienceRelevance * weightAudienceRelevance
* credibility * weightCredibility
* followUpPotential * weightFollowUpPotential

Et appliquer des pénalités :

* saturation élevée
* banalité élevée
* sujet trop connu
* faible potentiel visuel
* sujet trop générique
* difficulté à démontrer le fait
* crédibilité insuffisante

IMPORTANT :

Tous les poids doivent être configurables.

Ils ne doivent pas être hardcodés définitivement.

Le système doit permettre de faire évoluer le scoring à partir des performances historiques.

==================================================
PHASE 5 — ANTI-BANALITY ENGINE
==============================

Créer un système chargé d’éliminer automatiquement les facts génériques déjà surexploités.

Exemples de types de sujets à pénaliser fortement :

* « les poulpes ont trois cœurs »
* « les abeilles communiquent par une danse »
* « la foudre est plus chaude que le soleil »
* facts très connus
* faits pouvant être résumés en une phrase
* sujets déjà vus des milliers de fois
* sujets dont le seul intérêt vient d’une formulation artificiellement sensationnelle

Le système doit privilégier :

* phénomènes vécus par le spectateur
* phénomènes contre-intuitifs
* paradoxes
* comportements étranges du corps humain
* psychologie étrange
* phénomènes scientifiques du quotidien
* comportements animaux surprenants
* phénomènes spatiaux
* anomalies ou phénomènes inhabituels
* erreurs communes
* idées reçues
* expériences mentales
* conséquences surprenantes
* questions auxquelles les gens se sont déjà probablement posées
* sujets ayant un deuxième niveau d’information

Exemple :

Au lieu de :

« Les poulpes ont trois cœurs »

Préférer un angle du type :

« Pourquoi le cœur d’un poulpe s’arrête pratiquement lorsqu’il nage »

Le principe est de ne pas rechercher uniquement le FACT.

Rechercher le MEILLEUR ANGLE DU FACT.

==================================================
PHASE 6 — CONTENT ANGLE ENGINE
==============================

Pour chaque sujet sélectionné, générer plusieurs angles.

Exemple :

Sujet :
« phénomène X »

Angles possibles :

1. Pourquoi cela arrive
2. Ce que ton cerveau fait
3. Ce que ton corps fait
4. Pourquoi c’est contre-intuitif
5. Ce qui se passerait si
6. L’erreur que presque tout le monde fait
7. La conséquence inattendue
8. Le détail que personne ne remarque
9. L’histoire derrière le phénomène
10. Le paradoxe

Le système doit ensuite sélectionner les angles avec le meilleur potentiel.

==================================================
PHASE 7 — HOOK ENGINE
=====================

Le hook doit être traité comme une étape indépendante du script.

Ne jamais générer directement un seul hook.

Pour chaque sujet/angle, générer plusieurs hooks.

Objectifs du hook :

* arrêter le scroll
* créer une question mentale
* créer une tension
* introduire un mystère
* promettre une réponse
* être compréhensible immédiatement
* éviter les formulations génériques
* éviter « Saviez-vous que »
* éviter les introductions scolaires
* éviter les longues phrases
* éviter de donner toute la réponse immédiatement

Les hooks doivent pouvoir utiliser différents patterns :

### Curiosity gap

« Ton cerveau fait quelque chose de très étrange quand tu t’endors. »

### Experience

« Tu as probablement déjà vécu ça sans savoir pourquoi. »

### Contradiction

« Ce que tu crois être normal ne l’est pas vraiment. »

### Question

« Pourquoi ton corps fait-il ça alors que tu ne lui demandes rien ? »

### Unexpected consequence

« Et cette petite chose peut changer complètement ce qui se passe ensuite. »

### Mystery

« Pendant quelques secondes, ton cerveau ne sait littéralement plus quoi faire. »

### Specific phenomenon

« Pourquoi as-tu parfois l’impression de tomber juste avant de t’endormir ? »

Éviter les clickbaits mensongers.

Le hook doit correspondre au contenu réel.

==================================================
PHASE 8 — HOOK SCORING
======================

Chaque hook doit lui aussi être scoré.

Critères :

* curiosity
* clarity
* specificity
* surprise
* emotionalImpact
* openLoop
* credibility
* scrollStoppingPotential

Le meilleur hook est celui qui donne envie d’obtenir la réponse tout en restant honnête.

==================================================
PHASE 9 — SCRIPT ENGINE
=======================

Le script doit être pensé pour la RETENTION, pas simplement pour transmettre une information.

Structure par défaut :

0–2 secondes :
HOOK

2–5 secondes :
problème / mystère

5–12 secondes :
première explication

12–20 secondes :
développement / twist

20–27 secondes :
révélation / réponse

27–30+ secondes :
information secondaire ou payoff final

Cette structure doit être adaptative selon la durée.

Ne considère pas 30 secondes comme une règle fixe.

La durée doit dépendre du sujet.

Ne jamais rallonger artificiellement une vidéo.

Chaque seconde doit avoir une fonction.

Le script doit éviter :

* introduction inutile
* phrases vagues
* répétitions
* explications trop scolaires
* longues transitions
* conclusions génériques
* phrases de remplissage

Le script doit favoriser :

* phrases courtes
* progression
* information nouvelle régulièrement
* questions implicites
* open loops
* payoff
* détails inattendus
* changement de rythme

==================================================
PHASE 10 — SECONDARY OPEN LOOPS
===============================

Le système doit être capable d’introduire une seconde information qui donne envie de rester jusqu’à la fin.

Exemple :

« Et le plus étrange, c’est que… »

Mais cette formulation ne doit pas être utilisée comme simple gimmick.

Le payoff doit réellement être intéressant.

==================================================
PHASE 11 — FACT CHECKING
========================

Aucune affirmation scientifique importante ne doit être inventée.

Avant génération finale :

1. identifier les affirmations factuelles
2. vérifier leur cohérence
3. rechercher une source fiable lorsque nécessaire
4. détecter les simplifications excessives
5. détecter les mythes
6. détecter les statistiques douteuses
7. détecter les formulations absolues injustifiées

Le système doit distinguer :

FACT
OPINION
HYPOTHESE
APPROXIMATION
CLAIM CONTESTE

Une affirmation incertaine ne doit jamais être présentée comme un fait certain.

Chaque sujet doit pouvoir conserver ses sources.

==================================================
PHASE 12 — VISUAL ENGINE
========================

Le visuel ne doit pas être simplement décoratif.

Il doit contribuer à comprendre l’information.

Éviter le modèle :

voix IA
+
image stock
+
zoom lent
+
sous-titres

Le moteur doit générer un véritable plan visuel.

Chaque segment du script doit pouvoir avoir :

* image
* vidéo
* animation
* diagramme
* texte
* illustration
* transition
* zoom
* crop
* motion
* élément graphique

Le système doit favoriser les micro-séquences.

Exemple :

0.0–1.2 → visuel A
1.2–2.3 → visuel B
2.3–3.1 → texte plein écran
3.1–4.7 → visuel C
4.7–6.0 → animation
6.0–7.4 → visuel D

Les timings doivent être générés automatiquement.

Le système doit éviter les longs plans statiques lorsque cela n’est pas nécessaire.

==================================================
PHASE 13 — IDENTITÉ VISUELLE
============================

Le compte doit progressivement développer une identité reconnaissable.

Centraliser dans une configuration :

* font
* tailles
* style des sous-titres
* position des sous-titres
* animations
* transitions
* style de texte
* style de couverture
* voix
* musique
* sound effects
* rythme
* format vidéo

L’objectif est :

AUTOMATISATION ≠ ESTHÉTIQUE AUTOMATISÉE

La production peut être automatisée à 95 % tout en donnant l’impression d’un contenu éditorialement réfléchi.

==================================================
PHASE 14 — CONTENT FAMILIES
===========================

Créer un système de catégories.

Exemple :

BODY
PSYCHOLOGY
ANIMALS
SPACE
EVERYDAY SCIENCE
TECH
WEIRD HISTORY
DANGEROUS SCIENCE
HUMAN BEHAVIOR
NATURE
ETC.

Chaque vidéo doit appartenir à une ou plusieurs catégories.

Les performances doivent être agrégées par catégorie.

Exemple de métriques :

Body → 1420 vues moyennes
Psychology → 1180
Animals → 640
Space → 510
Tech → 280
General Facts → 190

L’objectif est de permettre au système de détecter automatiquement quelles familles semblent générer les meilleurs résultats sur les données disponibles.

IMPORTANT :

Ne pas conclure qu’une catégorie est « meilleure » sur la base de très peu de données.

Prévoir un nombre minimal d’observations.

==================================================
PHASE 15 — DATABASE
===================

Adapter la base de données existante ou créer les nouvelles tables nécessaires.

Minimum recommandé :

videos

fields :

id
topic_id
category_id
angle
hook
script
duration
voice
visual_style
posted_at
status
platform_id

topic_candidates

fields :

id
title
description
category
source
source_url
demand_score
curiosity_score
novelty_score
visual_score
comment_score
share_score
search_score
credibility_score
saturation_score
banality_score
follow_up_score
total_score
created_at
status

hooks

fields :

id
topic_id
hook_text
curiosity_score
clarity_score
specificity_score
surprise_score
open_loop_score
total_score

analytics

fields :

id
video_id
views
likes
comments
shares
saves
watch_time
average_watch_time
completion_rate
traffic_source
captured_at

experiments

fields :

id
experiment_type
variable
variant_a
variant_b
status
created_at
completed_at

performance_patterns

fields :

id
category
hook_pattern
duration_range
visual_style
topic_type
sample_size
average_views
average_completion
average_watch_time
average_comments
average_shares
confidence
updated_at

Adapte évidemment le schéma aux conventions du projet existant.

==================================================
PHASE 16 — ANALYTICS
====================

Le système doit collecter autant de métriques disponibles que possible.

Minimum :

* views
* likes
* comments
* shares
* saves
* watch time
* average watch time
* completion rate
* traffic source
* posting time
* category
* topic
* hook
* duration
* visual style

Calculer aussi :

like_rate
comment_rate
share_rate
save_rate
completion_rate

Exemple :

like_rate =
likes / views

comment_rate =
comments / views

share_rate =
shares / views

save_rate =
saves / views

==================================================
PHASE 17 — RETENTION ANALYSIS
=============================

La rétention doit être traitée comme une donnée majeure.

Lorsque des données suffisamment précises sont disponibles, analyser la courbe :

0s
1s
2s
3s
5s
10s
15s
20s
etc.

Détecter les zones de rupture.

Exemple :

100%
84%
71%
63%
60%
52%
48%
45%
41%

ou :

100%
58%
39%
30%

Dans le second cas, le système doit potentiellement identifier un :

HOOK_FAILURE

Autres diagnostics possibles :

TOPIC_FAILURE
HOOK_FAILURE
PACING_FAILURE
VISUAL_FAILURE
SCRIPT_FAILURE
PAYOFF_FAILURE
LOW_CREDIBILITY
LOW_SHAREABILITY
LOW_COMMENTABILITY

Ce système doit rester probabiliste et ne pas prétendre connaître la cause avec certitude lorsqu’il ne dispose pas des données suffisantes.

==================================================
PHASE 18 — PERFORMANCE ANALYSIS ENGINE
======================================

Après publication, le système doit analyser chaque vidéo.

Exemple :

Video #124

Topic:
Psychology

Hook:
« Tu as probablement déjà vécu ça… »

Duration:
28s

Views:
1820

Completion:
41%

Shares:
2.4%

Comments:
1.8%

Conclusion :

* hook probablement performant
* bonne rétention initiale
* potentiel de partage correct
* payoff à surveiller
* catégorie à retester

Le système doit produire un rapport structuré.

==================================================
PHASE 19 — LEARNING SYSTEM
==========================

Le système doit apprendre des performances passées.

Exemple :

Si plusieurs vidéos avec :

* phénomène quotidien
* hook de type “experience”
* 20–30 secondes
* visuels dynamiques

obtiennent des résultats supérieurs à d’autres combinaisons,

le système doit augmenter progressivement la probabilité de sélectionner ces caractéristiques.

NE PAS faire :

« Cette stratégie est la meilleure après deux vidéos. »

Utiliser :

* minimum sample size
* moyenne
* médiane
* historique
* comparaison entre variantes
* niveau de confiance
* récence des données

Le système doit tenir compte du fait que les performances peuvent changer dans le temps.

==================================================
PHASE 20 — A/B TESTING
======================

Le système doit permettre de tester une variable à la fois lorsque possible.

Exemple :

Même sujet
Même script
Même visuel
Même durée

Variation :

A :
« Voici pourquoi ton cerveau fait ça. »

B :
« Ton cerveau fait quelque chose d’étrange quand ça arrive. »

Puis comparer.

Autres variables testables :

* hook
* durée
* style visuel
* voix
* vitesse de narration
* sous-titres
* structure
* catégorie
* angle
* rythme

Le système doit conserver l’historique des expériences.

==================================================
PHASE 21 — COMMENT-DRIVEN CONTENT
=================================

Le système doit exploiter les commentaires lorsqu’ils sont accessibles.

Exemple :

Video 1 :
« Pourquoi ça arrive ? »

→ générer une vidéo 2.

Video 2 :
« Mais pourquoi notre cerveau fait ça ? »

→ vidéo 3.

Le système doit pouvoir identifier :

* questions répétées
* objections
* demandes d’explication
* sujets dérivés
* demandes de suite

Cela permet de créer des chaînes de contenu.

==================================================
PHASE 22 — CONTENT SERIES
=========================

Le système doit pouvoir regrouper plusieurs vidéos autour d’une série.

Exemple :

SERIES:
« Les choses normales qui sont en réalité complètement folles »

ou :

« Ton corps fait ça sans que tu le saches »

ou :

« La science derrière les choses du quotidien »

Une série doit pouvoir avoir :

* nom
* description
* style
* compteur d’épisodes
* catégories
* performances moyennes
* sujets associés

==================================================
PHASE 23 — CONTENT POSITIONING
==============================

Ne pas positionner le compte comme un simple compte de « facts ».

Le positionnement recherché doit être plus éditorial.

Exemples de concepts :

« Les choses normales qui sont en réalité complètement folles »

« Ton corps fait ça sans que tu le saches »

« Des phénomènes que tu as déjà vécus sans comprendre pourquoi »

« La science derrière les choses quotidiennes »

« Des choses incroyables que tu n’avais aucune raison de connaître »

La science est le MOYEN.

Le produit réel est la CURIOSITÉ + la DÉCOUVERTE.

==================================================
PHASE 24 — TOPIC EXAMPLES
=========================

À utiliser comme inspiration, pas comme liste fixe :

* Pourquoi ton cerveau peut provoquer une sensation de chute avant le sommeil
* Pourquoi certaines odeurs déclenchent immédiatement des souvenirs
* Pourquoi une chanson reste parfois bloquée dans ta tête
* Pourquoi tu ne peux pas vraiment te chatouiller correctement toi-même
* Pourquoi ton corps peut se réveiller avant ton réveil
* Pourquoi une canette froide devient mouillée
* Pourquoi certains sons provoquent des réactions physiques
* Pourquoi ton cerveau déteste les informations incomplètes
* Pourquoi certaines sensations apparaissent sans cause évidente
* Pourquoi certaines choses quotidiennes deviennent étranges lorsqu’on les observe scientifiquement

Chercher des sujets dans cette direction :

PHENOMÈNES VÉCUS
+
CURIOSITÉ
+
SCIENCE
+
SURPRISE
+
EXPLICATION

==================================================
PHASE 25 — DASHBOARD
====================

Améliorer le dashboard existant ou en créer un s’il n’existe pas.

Le dashboard doit au minimum permettre de voir :

### Overview

* nombre total de vidéos
* vues cumulées
* moyenne de vues
* médiane de vues
* taux moyen de complétion
* watch time
* likes
* comments
* shares
* saves

### Topic performance

* catégories
* sujets
* angles

### Hook performance

* patterns de hooks
* taux de réussite
* rétention initiale

### Visual performance

* styles visuels
* durées
* rythmes

### Experiments

* tests actifs
* tests terminés
* résultats

### Learning

Afficher ce que le système est actuellement en train d’apprendre.

==================================================
PHASE 26 — CONTENT PIPELINE
===========================

Créer un pipeline centralisé ressemblant conceptuellement à :

TopicDiscoveryJob
→ TopicScoringJob
→ TopicSelectionJob
→ HookGenerationJob
→ HookScoringJob
→ ScriptGenerationJob
→ FactCheckJob
→ VisualPlanningJob
→ VideoGenerationJob
→ PublicationJob
→ AnalyticsJob
→ PerformanceAnalysisJob
→ LearningJob

Utiliser l’architecture adaptée au projet.

Cela peut être :

* queue
* worker
* cron
* event-driven
* workflow engine

Ne force pas cette structure littéralement si le projet utilise déjà une autre architecture plus cohérente.

==================================================
PHASE 27 — CONFIGURATION
========================

Tous les éléments importants doivent être configurables.

Créer si pertinent une configuration similaire à :

content_engine:
topic_scoring:
weights:
demand: ...
curiosity: ...
novelty: ...
visual: ...
comments: ...
shares: ...
search: ...
credibility: ...

anti_banality:
enabled: true
threshold: ...

hooks:
variants_per_topic: 10

experiments:
enabled: true

analytics:
enabled: true

learning:
enabled: true

Les formats doivent correspondre au stack réellement utilisé.

==================================================
PHASE 28 — LOGGING
==================

Ajouter des logs structurés.

Exemples :

TOPIC_DISCOVERED
TOPIC_REJECTED
TOPIC_SELECTED
HOOK_GENERATED
HOOK_REJECTED
SCRIPT_GENERATED
FACT_CHECK_FAILED
VIDEO_GENERATED
VIDEO_PUBLISHED
ANALYTICS_UPDATED
PERFORMANCE_ANALYZED
LEARNING_UPDATED
EXPERIMENT_STARTED
EXPERIMENT_COMPLETED

Les logs doivent être suffisamment précis pour comprendre pourquoi une vidéo a été créée.

==================================================
PHASE 29 — ERROR HANDLING
=========================

Prévoir :

* retries
* timeout
* exponential backoff lorsque pertinent
* fallback providers
* validation
* erreurs API
* réponses IA invalides
* contenu vide
* source inaccessible
* informations contradictoires
* échec de génération vidéo
* échec de publication
* duplication de contenu

Aucun workflow critique ne doit s’arrêter silencieusement.

==================================================
PHASE 30 — DUPLICATION / REPETITION
===================================

Le système doit éviter de générer encore et encore le même sujet ou le même angle.

Détecter :

* même topic
* topic similaire
* hook similaire
* script similaire
* angle similaire
* structure trop similaire

Utiliser si nécessaire :

* embeddings
* similarity score
* hash
* NLP
* comparaison sémantique

==================================================
PHASE 31 — CONTENT DIVERSITY
============================

Ne pas tomber dans le piège d’un système qui ne produit plus qu’un seul type de vidéo.

Prévoir de l’exploration.

Exemple :

80 % :
patterns historiquement performants

20 % :
nouveaux patterns / exploration

Rendre cette logique configurable.

==================================================
PHASE 32 — PRIORITÉ D’IMPLEMENTATION
====================================

Ne cherche pas à tout coder en même temps.

Classe les fonctionnalités selon :

P0 :
indispensable

P1 :
fort impact

P2 :
amélioration

P3 :
future

Priorité générale :

1. Analyse de l’existant
2. Topic discovery amélioré
3. Topic scoring
4. Anti-banalité
5. Hook engine
6. Analytics
7. Performance analysis
8. Learning
9. Dashboard
10. A/B testing
11. Comment-driven content
12. Advanced experimentation

==================================================
PHASE 33 — PRINCIPES D’OPTIMISATION
===================================

Le système ne doit jamais optimiser uniquement les vues.

Une vidéo avec beaucoup de vues mais une faible rétention ou très peu d’engagement ne doit pas automatiquement être considérée comme un modèle parfait.

Analyser plusieurs dimensions.

L’objectif est d’identifier des PATTERNS reproductibles.

Exemple :

Pattern :

Topic:
everyday psychology

Hook:
experience-based

Duration:
22–28s

Visual:
high motion

Completion:
élevée

Shares:
élevés

Commentaires:
moyens

Ce type de pattern peut devenir un candidat à reproduire.

==================================================
PHASE 34 — RÈGLES ÉDITORIALES
=============================

Les vidéos doivent être :

* compréhensibles immédiatement
* intrigantes
* précises
* honnêtes
* visuellement intéressantes
* rapides
* suffisamment originales
* non répétitives
* non génériques

Éviter :

* « Saviez-vous que… »
* introductions lentes
* facts évidents
* clickbait mensonger
* statistiques inventées
* explications trop longues
* répétitions
* longues conclusions
* remplissage

==================================================
PHASE 35 — OBJECTIF FINAL
=========================

Le produit final ne doit plus être :

« une application qui génère automatiquement des vidéos TikTok »

Le produit final doit être :

« un système autonome capable de découvrir des opportunités de contenu, sélectionner les plus prometteuses, générer plusieurs angles et hooks, produire automatiquement la vidéo, mesurer les performances et améliorer progressivement ses décisions à partir des données historiques. »

Architecture conceptuelle finale :

```
                DATA SOURCES
                     │
   ┌─────────────────┼─────────────────┐
   ↓                 ↓                 ↓
TikTok            Trends             Reddit
   │                 │                 │
   └─────────────────┼─────────────────┘
                     ↓
              TOPIC DISCOVERY
                     ↓
               TOPIC SCORING
                     ↓
             ANTI-BANALITY
                     ↓
             ANGLE GENERATION
                     ↓
              HOOK GENERATION
                     ↓
               HOOK SCORING
                     ↓
              SCRIPT ENGINE
                     ↓
                FACT CHECK
                     ↓
              VISUAL ENGINE
                     ↓
               VIDEO ENGINE
                     ↓
                PUBLISHING
                     ↓
                ANALYTICS
                     ↓
           RETENTION ANALYSIS
                     ↓
         PERFORMANCE ANALYSIS
                     ↓
              LEARNING ENGINE
                     ↓
            EXPERIMENT ENGINE
                     │
                     └──────────────→
                       NEXT CONTENT
```

==================================================
PHASE 36 — CE QUE TU DOIS FAIRE MAINTENANT
==========================================

Étape 1 :
Analyse le repository entier.

Étape 2 :
Identifie l’architecture actuelle.

Étape 3 :
Crée TIKTOK_CONTENT_ENGINE.md avec une documentation complète du système actuel et du système cible.

Étape 4 :
Fais une proposition d’architecture qui respecte au maximum l’existant.

Étape 5 :
Identifie précisément les fichiers qui doivent être créés/modifiés.

Étape 6 :
Implémente les fonctionnalités P0.

Étape 7 :
Teste les nouvelles fonctionnalités.

Étape 8 :
Corrige les erreurs.

Étape 9 :
Documente dans TIKTOK_CONTENT_ENGINE.md les décisions techniques réellement prises pendant l’implémentation.

Étape 10 :
Fournis à la fin un résumé technique :

* architecture actuelle
* architecture ajoutée
* fichiers modifiés
* fichiers créés
* nouvelles tables
* nouvelles APIs
* nouveaux workers/jobs
* nouvelles variables d’environnement
* nouvelles métriques
* limites restantes
* prochaines étapes P1/P2/P3

IMPORTANT :

Ne te contente pas d’écrire une documentation théorique.

Je veux que tu transformes réellement le projet.

Commence par inspecter et comprendre le code existant, puis écris le Markdown de référence, puis implémente les améliorations de manière progressive, testable et maintenable.

Le critère de réussite n’est pas « plus de code ».

Le critère de réussite est que le système puisse répondre automatiquement à cette question :

« Quel type de vidéo devrais-je produire ensuite, pourquoi, avec quel sujet, quel angle, quel hook, quelle structure et quel style visuel, compte tenu de tout ce que mes vidéos précédentes ont appris ? » 
