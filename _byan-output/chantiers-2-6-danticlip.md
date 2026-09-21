# DANTI_CLIPER — Chantiers 2 à 6 (préparation)

> Document de cadrage. Chantier 1 (qualité du rendu) : implémenté à part.
> Établi par BYAN — date : 2026-09-10
> Base : inventaire fonctionnel complet de l'outil (code + DB + UI).

---

## Rappel du principe directeur

**Désirable → Prouvé → Large → Scalable → Monétisé.** Pas l'inverse.
Le chantier 1 s'attaque au « désirable ». Les chantiers 2-6 s'attaquent au reste.

---

## CHANTIER 2 — Analytics / preuve de valeur

**Objectif** : transformer `videos.youtube_id` (déjà stocké, jamais exploité) en preuve de valeur : vues, rétention, likes, commentaires. C'est l'argument de vente n°1 (« l'outil te montre ce qui marche ») et le carburant de l'itération.

### Périmètre
- Récupération périodique des statistiques YouTube par vidéo publiée.
- Dashboard de performance : par vidéo, par projet, par compte, par type de contenu.
- Historique des stats (courbes) pour suivre l'évolution.

### Implémentation technique
- **DB** : nouvelle table `video_stats` (`video_id` FK, `captured_at`, `views`, `likes`, `comments`, `retention_pct` si dispo). Une ligne par capture = historique. Table `youtube_id` déjà en place sur `videos`.
- **Backend** : nouveau module `server/src/lib/ytStats.ts` (appel YouTube Data API `videos.list?part=statistics`). Route `GET /api/analytics/summary`, `GET /api/analytics/video/:id`. Job périodique (même tick que l'automation ou cron séparé, ex. toutes les 6 h).
- **Scope OAuth** : ⚠️ le scope actuel est `youtube.upload` seulement. Pour lire les stats il faut ajouter `https://www.googleapis.com/auth/youtube.readonly`. Conséquence : **les utilisateurs existants doivent ré-autoriser** (bouton « reconnecter »). À gérer proprement (statut « reconnexion requise »).
- **Frontend** : page ou onglet « Performance » (TabBar) : cartes KPI (vues totales, vues/vidéo, meilleure vidéo), tableau triable, mini-graphes (SVG ou lib légère).

### Dépendances
- Quota API YouTube Data (10 000 unités/jour par défaut) : un `videos.list` par batch de 50 ids = 1 unité. Très peu coûteux.
- Ré-auth utilisateur pour le nouveau scope.

### Risques
- Vidéos en `private`/`unlisted` : stats limitées (normal).
- Compte non connecté / token révoqué : job silencieux, statut visible.

### Effort estimé
Moyen (2-3 jours). **Fort impact.**

### Critères de succès
- Le dashboard affiche les vues réelles par vidéo.
- On peut trier par performance et identifier les meilleures vidéos/sujets.
- Zéro intervention manuelle : les stats se rafraîchissent seules.

---

## CHANTIER 3 — Portée (élargir le marché)

**Objectif** : passer d'un outil « YouTube uniquement, un seul type de contenu » à un outil multi-plateformes et multi-formats.

### 3.1 Multi-plateformes (TikTok + Instagram Reels)
**Périmètre** : publier la même vidéo sur YouTube Shorts, TikTok et Instagram Reels.
**Implémentation** :
- Abstraction `publisher` : interface commune (`publish(video, meta) → {platformId, url}`), implémentations `youtubePublisher`, `tiktokPublisher`, `instagramPublisher`.
- **TikTok Content Posting API** : OAuth + review d'app (peut prendre du temps), upload direct ou via URL.
- **Instagram Graph API (Reels)** : nécessite un compte Instagram Business + page Facebook + app Meta validée.
- **DB** : table `publications` (`video_id`, `platform`, `platform_id`, `url`, `status`, `published_at`) — remplace le mono-champ `youtube_id` (à migrer).
- **UI** : choix des plateformes par projet et par règle d'automation.

**Risques** : validation d'apps longue (TikTok/Meta), quotas, API changeantes. **Effort : élevé. Impact commercial : très fort.**

### 3.2 Plus de types de vidéos (quick win)
**Périmètre** : le registry `VIDEO_TYPES` n'a qu'un type. Ajouter : `storytelling` (histoires originales), `top5`, `quiz`, `mythes`, `productivite`.
**Implémentation** : ajouter des entrées dans `src/videoTypes.ts` + fichiers de prompts dédiés. Exposé automatiquement par `GET /api/video-types` et l'UI.
**Effort : faible. Impact : fort (polyvalence = plus de clients).**

### 3.3 Formats multiples
**Périmètre** : 9:16 (existant), 1:1, 16:9.
**Implémentation** : paramétrer `W`/`H` dans `src/montage.ts` (déjà des constantes) + option projet `aspect_ratio`. Adapter positions mascotte/images/subs.
**Effort : faible-moyen.**

### Critères de succès
- Publier un même Short sur 3 plateformes depuis l'outil.
- Au moins 3 types de vidéos disponibles et fonctionnels.
- Rendu correct dans les 3 formats.

---

## CHANTIER 4 — Branding & personnalisation

**Objectif** : que chaque client ait SA marque dans le rendu (pas un template générique).

### Périmètre
- **Filigrane / logo** : image PNG positionnée (coin), opacité réglable.
- **Palette de couleurs** : couleurs de fond/sous-titres propres au compte (en plus des 8 palettes aléatoires).
- **Police** : choix de police de sous-titres (déjà `fontname` dans les styles).
- **Intro / outro** : clips courts ajoutés en début/fin (assets par compte).
- **Thumbnails** : génération d'une miniature (frame + titre stylisé).

### Implémentation
- **DB** : table `branding` (`user_id`, `logo_file`, `watermark_pos`, `watermark_opacity`, `colors_json`, `intro_file`, `outro_file`).
- **Backend** : routes upload/lecture/suppression (même modèle que mascotte), intégration dans `montage.ts` (overlay logo, intro/outro via concat).
- **UI** : onglet « Marque » dans ProfileTabs ou Settings.

### Risques
- Intro/outro : normalisation des formats (résolution/fps/audio) nécessaire avant concat.
- Quotas de stockage à étendre.

### Effort estimé
Moyen (3-4 jours).

### Critères de succès
- Un client configure son logo + couleurs et le retrouve dans chaque vidéo.
- Le rendu reste propre dans tous les styles.

---

## CHANTIER 5 — Robustesse / scalabilité

**Objectif** : passer d'un outil mono-process « qui marche sur ma machine » à un service fiable pour plusieurs clients.

### 5.1 File d'attente de rendu persistée
**Problème actuel** : `renderJobs` est en mémoire (`workflow.ts`). Perdu au redémarrage, pas d'annulation, un seul rendu à la fois, pas de priorité.
**Implémentation** : table `render_jobs` (`id`, `project_id`, `status` queued/running/done/error, `progress`, `attempts`, `error`, `created_at`, `started_at`, `finished_at`). Worker(s) qui pollent la table. Retry avec backoff. Annulation via statut.
**Effort : moyen-élevé. Impact : critique pour le SaaS.**

### 5.2 Tests automatisés + observabilité
**Problème actuel** : **aucun test** dans le dépôt. Seul `/api/health` + `server.log`.
**Implémentation** : Vitest (unitaires : prompts, subs, automation slot logic, paths) + tests d'intégration API (supertest). Logs structurés (JSON) + métriques simples (durée de rendu, taux d'échec).
**Effort : élevé. Impact : critique avant vente.**

### 5.3 Stockage objet (S3-compatible)
**Problème actuel** : stockage local uniquement, quota sur les fonds seulement.
**Implémentation** : abstraction `storage` (local | S3), migration progressive, URLs signées pour le download. Quotas sur vidéos/voix/fonds.
**Effort : élevé.**

### Critères de succès
- Un redémarrage du serveur ne perd aucun rendu en cours (reprise ou échec propre).
- Les tests couvrent le pipeline et l'API.
- Le stockage survit au passage multi-instances.

---

## CHANTIER 6 — Monétisation SaaS

**Objectif** : transformer l'outil en produit payant.

### Périmètre
- **Plans** : Free (limité), Pro, Business. Limites par plan (vidéos/mois, stockage, plateformes).
- **Paiement** : Stripe (Checkout + webhooks + portail client).
- **Comptes** : rôles (owner/member), équipes, invitation.
- **API publique** : tokens par compte, endpoints de création/publication, rate-limit, docs.
- **Onboarding** : parcours d'inscription → première vidéo en < 5 min.

### Implémentation
- **DB** : `plans`, `subscriptions` (`user_id`, `plan`, `status`, `stripe_customer_id`, `current_period_end`), `usage_counters` (par mois), `api_tokens`.
- **Backend** : middleware `requirePlan(feature)` + `checkQuota`, webhooks Stripe, portail.
- **UI** : page Tarifs, gestion d'abonnement, compteur d'usage.

### Risques
- Complexité réglementaire (TVA, facturation), support client.
- Ne pas monétiser avant d'avoir un produit désirable et prouvé (chantiers 1-2).

### Effort estimé
Élevé (1-2 semaines).

### Critères de succès
- Un client peut s'abonner, payer, et voir ses limites appliquées.
- L'usage est mesuré et facturé sans erreur.

---

## Séquencement recommandé

| Ordre | Chantier | Pourquoi maintenant |
|---|---|---|
| 1 | Qualité du rendu (fait) | Sans désirable, rien ne se vend |
| 2 | Analytics | Prouve la valeur, guide l'itération |
| 3 | Types de vidéos (quick win) | Élargit la cible à faible coût |
| 4 | Multi-plateformes | Le grand argument commercial |
| 5 | Branding | Fidélise les clients payants |
| 6 | Robustesse/scale | Nécessaire pour servir N clients |
| 7 | Monétisation | Après preuve de valeur |

---

## Décisions ouvertes (à trancher avec Yan)

1. **SaaS ou outil perso ?** → conditionne la priorité des chantiers 5-6.
2. **Quelles plateformes en premier** : TikTok ou Instagram ? (TikTok = plus simple d'accès API ; Meta = validation plus lourde)
3. **Quels types de vidéos** ajouter en premier ? (storytelling, top5, quiz, productivité)
4. **Paiement** : Stripe uniquement (EU) ou autre ?
