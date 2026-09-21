# Réunion d'agents — Volume musique + Chantier 2a (stats)

> Participants : Winston (Architecte), Amelia (Dev), Sally (UX), John (PM), Mary (Analyst).
> Date : 2026-09-10. Facilitateur : BYAN.

---

## Sujet A — Volume de la musique

### Décisions
- **Défaut moteur : 0.35** (au lieu de 0.25) — « un peu plus fort ».
- **Colonne `music_volume REAL`** sur `projects` et `automations`. **NULL = défaut moteur** (pas de backfill ; changer le défaut plus tard se propage).
- Bornes **0..1** (zod + DB), plage conseillée 0.10–0.60. Au-delà : risque de masquer la voix / clipping (`amix normalize=0` n'atténue pas).
- **Piège** : `Number(null) === 0` → toujours `v != null ? Number(v) : undefined`.
- UI : slider **0–100 %**, défaut affiché **35 %**, **visible mais grisé** quand la musique est désactivée (découvrable, valeur conservée).

### Fichiers touchés
`db.ts` (colonnes + migrations), `montage.ts` (défaut + clamp), `workflow.ts` (ProjectRowLite, startVideoRender, PATCH render-options), `lib/automation.ts` (row + INSERT), `routes/automation.ts` (serialize/POST/PATCH), `schemas.ts`, `serialize.ts`, `web/src/types.ts`, `Project.tsx`, `Automation.tsx`.

---

## Sujet B — Chantier 2a (stats YouTube)

### Découverte majeure (John/Mary)
**Les stats des vidéos PUBLIQUES s'obtiennent avec une simple clé API (`YOUTUBE_API_KEY`), sans OAuth.** → **Aucun changement de scope, aucune ré-autorisation, aucun impact sur l'automation.** Le scope `youtube.readonly` n'est nécessaire que pour les vidéos private/unlisted (→ 2b). Le scope `yt-analytics.readonly` (rétention) → 2b aussi.

### Décisions
- **Voie 2a : clé API** (`videos.list?part=statistics`, 1 unité par batch de 50).
- Colonnes sur `videos` : `views`, `likes`, `comments`, `stats_updated_at`, `stats_status` (`ok` / `missing`).
- **Pas de colonne rétention en 2a** (elle resterait NULL et ferait croire que la métrique existe).
- Module `server/src/lib/ytStats.ts` : `refreshUserVideoStats` / `refreshAllVideoStats`, batch 50, timeout 10 s, verrou anti-double-run, arrêt sur quota/scope, `missing` si vidéo absente (ne jamais remettre à 0).
- Route manuelle `POST /api/youtube/stats/refresh` (cooldown 5 min).
- Job périodique **toutes les 6 h** (premier run +60 s), `STALE_HOURS=5`, `.unref()`.
- Exposition dans `GET /api/videos/library` + `getVideos` (ProjectDto).
- UI : **Library** (ligne compacte `1.2K views · 84 likes · 12 comments` + bouton `Refresh stats`), **Project** (bloc `YouTube stats` sous la vidéo). Dashboard KPI → plus tard.
- État « pas de clé / non publiée » : message muted explicite, jamais de faux 0.

### Métriques minimales (produit)
M1 vues (à 48 h / 7 j à terme), M2 likes/1000 vues, M3 commentaires/1000 vues, M4 médiane des vues + % vidéos ≥ 1 000, M5 taux de publication. En 2a on stocke le lifetime + le refresh ; l'historique 48 h/7 j viendra avec une table `video_stats` en 2b.

### Protocole d'expérience (après 2a)
3 semaines, ~42 vidéos, **une seule variable : l'`angle`** (5 archétypes déjà en base), 2 groupes d'angles, 1 A + 1 B par jour (ordre alterné), tout le reste verrouillé (EN, voix, style, musique, effets, durée). Critère de sortie : ≥ 3 vidéos ≥ 1 000 vues à 7 j ET médiane ≥ 150 → continuer ; 0 vidéo > 500 ET médiane < 50 sur 40 vidéos → pivoter.

### Hors 2a
Rétention (Analytics API), stats private/unlisted, onglet Performance dédié, graphes historiques, stats TikTok/IG, polling < 6 h.

---

## Ordre d'implémentation retenu
1. Volume musique (DB → montage → workflow → automation → schemas → serialize → UI).
2. Stats : migrations `videos` → `ytStats.ts` → route refresh → exposition DTO → UI → job.
3. Validation : typecheck + build + redémarrage + test.
