# DANTI CLIPER

Générateur de Shorts quasi-automatiques pour YouTube / TikTok / Instagram.

## Pipeline

```
sujet  →  idées (LLM)  →  script (LLM)  →  voix (Edge TTS)  →  [montage]  →  publication
```

## Stack

- **Backend** : Node.js + TypeScript, Express, SQLite (`node:sqlite` natif), auth sécurisée (scrypt + sessions hashed + CSRF + rate-limit)
- **Frontend** : React + Vite
- **Génération texte** : API LLM compatible OpenAI (Groq gratuit par défaut)
- **Voix** : Edge TTS (gratuit, illimité)

## Sécurité

- Mots de passe hachés avec scrypt (KDF mémoire-lourd, sel aléatoire, comparaison timing-safe)
- Sessions serveur (token hashé en base), cookies HttpOnly + SameSite=Strict + Secure
- Protection CSRF (jeton double-submit), anti brute-force (5 essais / 15 min / IP)
- Requêtes SQL paramétrées, validation zod, protection path traversal, en-têtes durcis (helmet)
- CSV des secrets jamais commité (`.env`, `data/` git-ignorés)

## Lancer

```bash
npm install
npm run seed        # cree le compte admin (ADMIN_USERNAME / ADMIN_PASSWORD dans .env)
npm run server      # http://localhost:3001
```

## Dev (rechargement à chaud)

```bash
npm run server:watch
npm run dev --prefix web   # http://localhost:5173
```

## Config

Copier `.env.example` vers `.env` et renseigner :
- `LLM_PROVIDER` + `LLM_API_KEY` + `LLM_MODEL` (Groq : `openai/gpt-oss-120b`)
- `EDGE_VOICE` (voix FR Edge TTS)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- `COOKIE_SECURE=true` en production (HTTPS)

Les vidéos de fond se placent dans `assets/backgrounds/`.
