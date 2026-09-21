# DANTI_CLIPER — Dossier de lancement complet

> Réunion d'agents du 2026-09-10 : juriste/fiscaliste, DPO RGPD, expert licences API, CFO monétisation, growth TikTok.
> Aucune décision juridique finale ici : les points ⚠️ doivent être validés par un expert-comptable / avocat.

---

## SYNTHÈSE EXÉCUTIVE

**Verdict : le lancement est possible, mais 3 prérequis BLOQUANTS avant de facturer.**

1. **Edge TTS doit être remplacé** — double problème : (a) accès non autorisé aux ToS Microsoft (émulation du client Edge), (b) la lib `edge-tts-universal` est en **AGPL-3.0** (copyleft réseau : obligation potentielle d'ouvrir le code du SaaS). Solution : **Azure AI Speech**, licite, avec **0,5 M caractères/mois gratuits** → coût réel ~0 €/mois à ton volume.
2. **YouTube : audit API obligatoire** — les projets API non audités créés après 2020 uploadent en **privé forcé**. Sans audit de conformité, tes clients ne peuvent pas publier publiquement via l'outil. + vérification OAuth (100 users max, refresh tokens expirant sous 7 j avant validation).
3. **Statut juridique + conformité du site** — micro-entreprise à immatriculer pour facturer, mentions légales LCEN, CGV/CGU, médiateur, bouton de rétractation, politique de confidentialité à mettre à jour (elle contient des erreurs factuelles).

---

## 1. JURIDIQUE & SOCIÉTÉ (France, 2026)

### Faut-il une société ?
**Recommandation : micro-entreprise maintenant.** Gratuite, immédiate, charges proportionnelles au CA, ACRE possible la 1re année. Le vrai déclencheur de bascule n'est pas le seuil, mais **les coûts IA non déductibles** (abattement forfaitaire) et la vente/levée.

- **Bascule vers SASU** si : vente de l'entreprise envisagée (cession d'actions 0,1 % vs fonds de commerce), levée de fonds, associés.
- **EURL à l'IS** si priorité au net perçu (TNS ~40-45 % vs assimilé salarié ~75-80 %).
- Quand : CA ~50-70 k€, ou charges déductibles > abattement, ou vente à 12-18 mois.

### Seuils 2026 (vérifiés)
| Donnée | Valeur |
|---|---|
| Plafond micro services (BIC/BNC) | **83 600 €** |
| Cotisations BIC services | **21,2 %** (+1,7 % si versement libératoire) |
| Cotisations BNC | 25,6 % |
| Franchise TVA services | **37 500 €** (majoré 41 250 €) |
| IS (si société) | 15 % ≤ 42 500 € puis 25 % |
| PFU dividendes | 31,4 % |

- **TVA** : 20 % France ; **autoliquidation + DES** en B2B UE ; **OSS** si > 10 000 €/an de B2C UE ; hors champ pour un client US B2B.
- **Facturation électronique** : réception obligatoire dès le 01/09/2026, émission (micro) 01/09/2027.
- ⚠️ Classification BIC/BNC à confirmer à l'immatriculation.

### Obligations du site
- **Mentions légales** (LCEN art. 1-1) : identité, adresse, contact, SIRET, RCS, directeur de publication, **hébergeur**, sous-traitants de stockage.
- **CGV (B2C) / CGU (B2B)** : prix, licence d'usage des outputs, limites de responsabilité, résiliation.
- **Médiateur de la consommation** obligatoire en B2C (~0-150 €/an) + affichage.
- **Bouton de rétractation en ligne** obligatoire depuis le 19/06/2026 (abonnements SaaS B2C inclus). Exception contenu numérique = double case non pré-cochée + confirmation.
- **Cookies** : session + CSRF = strictement nécessaires → pas de consentement requis. Bandeau informatif OK. Toute analytics/pub future = consentement.

### Propriété intellectuelle
- **Code** : droit d'auteur automatique. Preuve : Git horodaté. Si société : cession/apport écrit obligatoire.
- **Marque INPI** : 190 € (1 classe) + 40 €/classe. Classes : 9, 35, 41, 42. **À déposer avant communication large.**
- **Contenus IA** : protégeables seulement si apport humain démontré (prompts itérés, sélection, montage). Documenter le processus. Transparence AI Act (art. 50) + YouTube (déclaration contenus synthétiques).
- **RC pro** : ~200-500 €/an, en déclarant explicitement l'édition SaaS + cyber. Attention aux exclusions « édition de produit propre ».

---

## 2. RGPD & CONFORMITÉ

### Ce qui est déjà bien
Hachage scrypt, sessions hashées, CSRF, rate-limit, Helmet/CSP, chiffrement AES-256-GCM du BYOK, suppression de compte self-service, purge des vidéos non gardées, aucun traceur soumis à consentement.

### Problèmes constatés
1. **Politique de confidentialité non conforme** : annonce `SameSite=Strict` (le code utilise `lax`), dit « LLM mock » alors que Groq est actif, ne mentionne pas Pexels, pas Microsoft, pas l'hébergeur, et **manque les obligations YouTube API** (mention « uses YouTube API Services », lien Google Privacy, lien YouTube ToS, révocation, suppression ≤ 30 j). Risque : suspension du client OAuth.
2. **Tokens YouTube stockés en clair** (access + refresh) — à chiffrer comme le BYOK.
3. **Mascotte non supprimée** au delete de compte ; fichiers disque orphelins à la suppression de projet.
4. **Droits incomplets** : pas de changement de mot de passe/pseudo (droit de rectification annoncé mais non exerçable), pas d'export JSON self-service.
5. **Registre des traitements absent** (Art. 30) — obligatoire.
6. **Sessions expirées non purgées** périodiquement.
7. **Procédure de violation 72 h** non documentée.

### Sous-traitants / transferts
| Fournisseur | Transfert | Action |
|---|---|---|
| Groq (US) | CCT mod. 2/3, pas de DPF | Archiver le DPA + TIA |
| Microsoft (Edge TTS) | **Aucun DPA applicable** | **Migrer vers Azure Speech (DPA + région France)** |
| Pexels (DE/US) | CCT | Divulguer dans la politique |
| Google/YouTube (US) | DPF certifié | Politique conforme Developer Policies |
| Hébergeur | UE | Nommer + DPA |

### Checklist RGPD
1. Remplacer Edge TTS (bloquant commercial).
2. Mettre la politique en conformité (YouTube API, Pexels, transferts, SameSite, hébergeur, version FR).
3. Créer le registre des traitements.
4. Chiffrer les tokens YouTube + purger sessions/mascotte/fichiers.
5. Ajouter changement de mot de passe + export JSON.
6. Signer/archiver les DPA + TIA Groq.
7. Procédure de violation 72 h + journal.
8. Chiffrement au repos, sauvegardes, HSTS.

---

## 3. LICENCES & APIs — LE POINT CRITIQUE

| Dépendance | Usage commercial | Risque | Action |
|---|---|---|---|
| **Edge TTS** (`edge-tts-universal`) | **NON autorisé** | **CRITIQUE** : ToS Microsoft (émulation) + **AGPL-3.0** (copyleft réseau) | **Remplacer par Azure AI Speech** (0,5 M car. gratuits/mois) |
| **Groq** | OUI | Faible | Passer en Developer tier + DPA + ZDR |
| **Pexels** | OUI | Moyen | **Attribution API obligatoire** (lien Pexels + crédit) ; pas de revente standalone ; journaliser les téléchargements |
| **YouTube Data API** | OUI | **ÉLEVÉ** | **Audit API Compliance obligatoire** (sinon uploads en privé) ; quota 100 uploads/j/projet ; stockage données ≤ 30 j |
| **Google OAuth** (`youtube.upload`) | OUI | **ÉLEVÉ** | **Vérification OAuth obligatoire** ; avant : 100 users max + tokens 7 j |
| **Musiques** (Pixabay, YT Audio Library) | OUI | Moyen | Conserver les certificats de licence ; Content ID claims possibles |

### Détail Edge TTS (le plus grave)
- **ToS Microsoft** : aucune licence publiée pour l'usage commercial du TTS « Read Aloud ». Le Microsoft Services Agreement interdit l'émulation et l'accès non autorisé par des clients tiers. `edge-tts-universal` **émule Edge 143 avec un cookie MUID** → accès non autorisé. Microsoft recommande explicitement **Azure AI Speech** pour un usage commercial.
- **AGPL-3.0** : la lib est sous AGPL. L'AGPL §13 impose à l'exploitant d'un service réseau de fournir le code source correspondant aux utilisateurs. Pour un SaaS fermé = contamination IP potentielle. **Motif de remplacement à lui seul.**
- **Coût de la conformité** : Azure AI Speech = **0 $/mois** à ton volume (0,5 M caractères gratuits ≈ 550 vidéos/mois), puis ~15 $/M caractères. Google Cloud TTS : 1 M caractères gratuits/mois. **Il n'y a aucune raison économique de garder Edge TTS.**

---

## 4. MONÉTISATION

### Coûts (par vidéo, avec Azure TTS)
| Poste | Coût |
|---|---|
| LLM Groq (gpt-oss-120b) | ~0,003 € |
| Voix Azure (900 car./vidéo) | ~0,0125 € |
| Pexels | 0 € (quota 200 req/h) |
| Serveur (VPS mutualisé) | ~0,003-0,01 € |
| **Total** | **~0,02-0,03 €/vidéo** |

### Grille proposée (prix TTC, micro en franchise TVA) — v2 (décidé par Yan)
| | Free | Discover | Pro | Creator |
|---|---|---|---|---|
| Prix | 0 € | **5 €/mois** | **19 €/mois** | **49 €/mois** |
| Positionnement | Découverte | Tester les fonctions clés | Plus de fonctions + PLUS de production | Gros volume (ex. 5/jour) |
| Vidéos/mois | 3 | à calculer | à calculer | ~150 (5/jour) |
| Qualité | 720p + watermark | 1080p | 1080p sans watermark | 1080p + priorité |
| Publication auto | — | Oui | Oui | Oui |
| Marge brute | acquisition | à calculer | ~92 % | ~88 % |

> Quotas Discover/Pro à calculer (coût variable négligeable ~0,02 €/vidéo avec Azure ; le vrai levier est la charge serveur et la valeur perçue).

- **Break-even : 2 clients Pro** couvrent les charges fixes lean (~29 €/mois).
- **Stripe** : 1,5 % + 0,25 € EEE + 0,7 % Billing + 0,5 % Tax → ~4 % du CA. Payment Links + Customer Portal au lancement.
- **Early adopters** : −50 % pendant 12 mois pour les 100 premiers (pas de lifetime illimité).
- **Piège B2C UE** : dès 10 000 €/an de ventes UE hors France → TVA du pays via OSS.

---

## 5. LANCEMENT & GROWTH

### Stratégie : 2 comptes
- **Compte Culture G (existant)** : vues + autorité. 80 % du contenu. 1 méta/semaine max.
- **Compte Outil (nouveau)** : conversion créateurs. 100 % méta.
- Le compte culture EST la preuve : « cette vidéo est 100 % générée ».

### 8 idées de vidéos méta
1. « Cette vidéo, je ne l'ai pas montée. » (la vidéo est sa propre preuve)
2. « Je publie 100 Shorts en 30 jours, zéro montage à la main. » (build in public)
3. « 3 heures vs 4 minutes. » (comparatif chrono)
4. « Combien coûte vraiment un Short ? » (breakdown chiffré)
5. « POV : tu es créateur faceless et tu détestes monter. »
6. « J'ai testé mon IA sur une niche que je ne connais pas. »
7. « Le hook que j'utilise pour faire X vues (et comment l'IA le génère). »
8. « On m'a dit : c'est juste ChatGPT. » (objection handling)

### Profil TikTok
- **Compte Business** (lien bio immédiat).
- Bio : `Je génère mes Shorts avec une IA 🤖 / Culture G · script + voix + montage auto / Essaie l'outil ↓ danticlip.kurdant.fr`
- **1 seul lien cliquable** (bio) + **UTM obligatoire** : `?utm_source=tiktok&utm_medium=bio&utm_campaign=lancement`.
- **CTA comment-to-DM** (« commente OUTIL ») à tester : booste les commentaires, évite la pénalité des URLs externes.

### Waitlist recommandée (pas d'ouverture brute)
Raisons : serveur mono-process (1 rendu à la fois, file en mémoire), pas de quotas, support solo.
- Outil simple (Waitlister/LaunchList free), parrainage (« invite 3 amis pour passer devant »).
- Invitations par lots de 20/semaine, onboarding manuel.
- `/register` accessible uniquement sur code d'invitation pendant le lancement.

### Plan 4 semaines
- **S1 — Labo de rétention** : compte Business + bio + waitlist + landing FR (bloquant : la landing est en anglais pour une audience FR). 1-2 vidéos culture/jour, variable unique = angle. 3 méta. Go/no-go : rétention 3s > 60 %, completion > 50 %, ≥ 1 vidéo > 1 000 vues.
- **S2 — Amplification** : doubler l'angle gagnant, 3 méta, cross-post YT Shorts + Reels, X build-in-public. Go/no-go : médiane > 150, ≥ 1 vidéo > 5 000.
- **S3 — Pré-lancement** : waitlist 300+, page Product Hunt, 15-25 supporters, Indie Hackers + r/SideProject.
- **S4 — Lancement public** : Product Hunt mardi 9h01 Paris, email waitlist, 20-30 invités, onboarding manuel, contenu quotidien maintenu.

### Pièges
1. Lancer large avant d'avoir un contenu qui retient.
2. Ouvrir les inscriptions sans quotas ni file persistante.
3. Mélanger culture G et méta sur le même compte.
4. Mettre un lien dans la légende (pénalité de portée).
5. Cross-poster avec watermark TikTok.
6. Surpromettre (« 1M de vues garanties »).
7. Landing anglaise pour une audience FR.
8. Ignorer le SEO TikTok (mots prononcés dans les 5 premières secondes).

---

## 6. RISQUES CRITIQUES (par gravité)

| # | Risque | Gravité | Action |
|---|---|---|---|
| 1 | Edge TTS (ToS + AGPL) | **CRITIQUE** | Migrer vers Azure Speech avant facturation |
| 2 | YouTube uploads en privé (projet non audité) | **CRITIQUE** | Lancer l'audit API Compliance |
| 3 | OAuth non vérifié (100 users, tokens 7 j) | **ÉLEVÉ** | Déposer la vérification (politique, domaine, vidéo démo) |
| 4 | Politique de confidentialité non conforme YouTube API | **ÉLEVÉ** | Mettre à jour (risque suspension OAuth) |
| 5 | Pas de statut juridique (pas de facturation possible) | **ÉLEVÉ** | Immatriculer la micro-entreprise |
| 6 | Serveur mono-process sans quotas | **ÉLEVÉ** | Waitlist + quotas par compte |
| 7 | Politique YouTube « inauthentic content » | **ÉLEVÉ** | Personnalisation, avertir les clients |
| 8 | Tokens YouTube en clair | MOYEN | Chiffrer AES-GCM |
| 9 | Pexels attribution absente | MOYEN | Ajouter le crédit |
| 10 | Landing anglaise (audience FR) | MOYEN | Version FR |

---

## 7. CHECKLIST DE LANCEMENT (ordonnée)

**Avant toute facturation :**
1. Immatriculer la micro-entreprise (INPI) + ACRE sous 60 j.
2. Migrer Edge TTS → Azure Speech.
3. Lancer l'audit YouTube API Compliance.
4. Déposer la vérification OAuth (politique conforme, domaine, vidéo démo).
5. Mettre à jour la politique de confidentialité (YouTube API, Pexels, transferts, hébergeur, FR).
6. Mentions légales + CGV/CGU + médiateur + bouton de rétractation.
7. Chiffrer les tokens YouTube + purger sessions/mascotte/fichiers.
8. Registre des traitements + procédure de violation 72 h.
9. Dépôt de marque INPI (190 €).
10. RC pro (édition SaaS déclarée) + cyber.

**Avant le lancement public :**
11. Landing FR + page waitlist.
12. Quotas par compte + limite d'inscriptions.
13. Stripe (Payment Links) + grille Free/Pro/Business.
14. Compte TikTok Business + bio + UTM.
15. 3 vidéos méta prêtes + 3 épingles.

**Ensuite :**
16. Plan 4 semaines (labo → amplification → pré-lancement → Product Hunt).

---

## 8. DÉCISIONS À PRENDRE (avec Yan)

1. **Statut** : micro-entreprise maintenant (recommandé) ou SASU direct ?
2. **TTS** : Azure Speech (recommandé, 0 €/mois) — on planifie la migration ?
3. **Pricing** : Free 3 vidéos / Pro 19 € / Business 49 € — on valide ?
4. **Lancement** : waitlist avec lots (recommandé) ou inscriptions ouvertes ?
5. **Landing** : version FR à faire (bloquant pour l'audience FR) ?
6. **Marque** : dépôt INPI maintenant ?
