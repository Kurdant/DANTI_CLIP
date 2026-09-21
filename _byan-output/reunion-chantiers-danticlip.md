# Réunion d'agents — DANTI_CLIPER (chantiers 1 à 6)

> Facilitateur : BYAN. Participants : Winston (Architecte), Sally (UX), Amelia (Dev), John (PM), Mary (Analyst), Nova (Croissance).
> Date : 2026-09-10. Base : inventaire fonctionnel complet + exploration du code et de la base réelle.

---

## 1. Découvertes majeures (vérifiées)

| Découverte | Détail | Impact |
|---|---|---|
| **Le canal n'est pas mort** | 2 Shorts du 3 sept = **1292 et 1242 vues** (contenu anglais hors pipeline). Le contenu FR généré = **0-3 vues**. | L'algorithme pousse CE canal. Le problème est le **contenu généré**, pas la chaîne. |
| **Bug destructeur de données** | La publication manuelle ne met jamais `kept=1` → la purge (24 h + au rendu suivant) supprime les lignes DB. **6 des 8 vidéos publiées ont perdu leur ligne**, 2 `youtube_id` seulement sur 8. | Le suivi des vues est impossible. À corriger en priorité. |
| **Fichiers orphelins** | 31 MP4 (667 Mo) sur disque pour 4 lignes DB. | Disque qui se remplit, aucun nettoyage. |
| **Voix par défaut anglaise** | `config.edgeVoice = en-US-AndrewMultilingualNeural` alors que la langue est `fr`. | Incohérence sur du contenu FR. |
| **Rétention non disponible en Data API** | `videos.list?part=statistics` ne donne PAS la rétention. Il faut **YouTube Analytics API** (`yt-analytics.readonly`). | Le chantier 2 doit être décomposé : stats simples (Data API) puis rétention (Analytics API). |
| **Edge TTS non licencié commercial** | Endpoint grand public. | Risque réel si vente de l'outil. À migrer avant monétisation. |
| **Clé LLM globale** | Les utilisateurs brûlent le budget de Yan, aucun quota. | À quota-er avant SaaS. |

## 2. Décisions techniques (chantier 1)

- **Ordre d'implémentation** (Winston) : 1) voix rate/pitch (plumbing), 2) musique + ducking, 3) Ken Burns + transitions, 4) karaoké + pop-in, 5) B-roll vidéo.
- **Ducking** : `asplit` sur la voix + `sidechaincompress` + `amix` avec `normalize=0`, `aformat` identique des deux côtés (voix 24 kHz mono vs musique 44,1 kHz stéréo). Fallback sans musique = comportement actuel.
- **Ken Burns** : `zoompan` (d=1, accumulateur zoom) + upscale 2× avant pour limiter le jitter. **Problème structurel à corriger** : les images actuelles démarrent à t=0 et sont affichées via `enable=between(...)` → il faut `trim + setpts=PTS-STARTPTS + setpts=PTS+start/TB` pour que les animations soient calées en temps global. `overlay:format=auto` obligatoire (sinon alpha jeté).
- **Karaoké** : un event ASS par mot (le mot courant surligné), en s'appuyant sur les word boundaries déjà disponibles. Pop-in : `\fad` + `\t(\fscx/\fscy)`.
- **B-roll** : endpoint Pexels `/videos/search?orientation=portrait`, choix mp4 portrait, `-stream_loop -1 -t d`. Priorité vidéo > photo > fond.
- **Inputs ffmpeg** : centraliser le calcul des index (fond=0, médias=1..N, mascotte, voix, musique) — point de fragilité actuel.

## 3. Décisions UI (Sally / Amelia)

- Nouveaux composants : `MusicPicker`, `EffectsPicker`, `VoicePicker` (rate/pitch + extrait), et source unique des styles de sous-titres.
- **Global (Settings)** : valeurs par défaut du compte (voix, habillage, musique) — la page Settings aujourd'hui vide.
- **Projet** : choix par vidéo (le pattern `selected_background` / `text_style` existe déjà).
- **Automation** : choix figés dans la règle (auto-suffisante, ne doit pas changer silencieusement).
- Nouveaux styles de sous-titres : `pop` et `karaoké`.
- DB : colonnes sur `projects`, `automations`, `users` (défauts), `voices` (rate/pitch appliqués).

## 4. Challenges PM/Analyst (John & Mary)

1. **La priorisation du document était feature-driven, pas evidence-driven.** Il manque un **jalon d'expérimentation contenu** : 3 semaines, 1 niche, variables verrouillées, critère de sortie chiffré. Sinon on empile des fonctionnalités sans preuve.
2. **SaaS vs perso : ni l'un ni l'autre.** Beta fermée + « canal clé en main ». Bascule SaaS seulement si : 1 vidéo >1k vues OU 1 client payant OU 10 comptes externes.
3. **Multi-plateformes : gelé derrière la preuve.** Les API TikTok/Meta ont des revues de plusieurs semaines. Export manuel en attendant (0 développement).
4. **Types de vidéos : attention à la cohérence de niche.** Ajouter des types = diluer le signal. `mythes` (déjà un angle) et `quiz` (engagement) sont les seuls candidats.
5. **Chantier 4 : supprimer intro/outro et thumbnails** (contradictoires avec RG-002 « hook en 1-2 s » et le feed Shorts qui utilise la frame).
6. **Chantier 5 : estimations sous-évaluées** — queue persistée 2-3 j, tests ciblés 2-3 j. SQLite `node:sqlite` est expérimental.
7. **Chantier 6 : sous-évalué 2-3×.** Juridique (TVA, CGV, DPA), licence TTS, vérification OAuth >100 users, quotas LLM.

## 5. Quick wins retenus (à faire cette semaine)

1. **Fix `kept=1` à la publication** (bug destructeur) — intégré au chantier 1.
2. **Voix FR par défaut** — intégré au chantier 1E.
3. **Instrumentation stats minimale** (chantier 2a) — après le chantier 1.
4. **Nettoyage orphelins** — à planifier (attention à ne pas supprimer de vidéos publiées).
5. **Surfacer `last_result`** des automations dans l'UI.

## 6. Séquencement révisé (proposition)

| Ordre | Action | Durée |
|---|---|---|
| 1 | **Chantier 1 — Qualité du rendu** (en cours) | ~2 sem. |
| 2 | Fix purge + instrumentation stats (2a) | ~1 j |
| 3 | Expérience contenu contrôlée (3 sem., variables verrouillées, critère de sortie) | 3 sem. |
| 4 | Décision : itérer ou pivoter (service clé en main) | — |
| 5 | Selon preuve : types de vidéos / branding / multi-plateformes / scale / SaaS | — |

## 7. Points à trancher avec Yan

1. **Musique** : où trouver les pistes libres (le dossier `assets/music` est prêt, il faut les fichiers) — Pexels n'a pas d'API musique.
2. **Karaoké × emphase** : en karaoké, désactiver l'emphase hook/chiffres existante pour ne pas cumuler deux animations ?
3. **Défaut effets** : activés pour les nouveaux contenus, désactivés pour l'existant ?
4. **B-roll** : vidéo prioritaire sur photo, ou mix ?
