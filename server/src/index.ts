import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerEnv } from "./lib/env.js";
import { attachAuth, ApiError } from "./auth/middleware.js";
import { seedAdmin } from "./seed.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { workflowRouter } from "./routes/workflow.js";
import { backgroundsRouter } from "./routes/backgrounds.js";
import { mascotRouter } from "./routes/mascot.js";
import { audioRouter } from "./routes/audio.js";
import { videosRouter } from "./routes/videos.js";
import { youtubeRouter } from "./routes/youtube.js";
import { automationRouter } from "./routes/automation.js";
import { musicRouter } from "./routes/music.js";
import { sfxRouter } from "./routes/sfx.js";
import { tickAutomation } from "./lib/automation.js";
import { refreshAllVideoStats } from "./lib/ytStats.js";
import { dbQuery } from "./auth/middleware.js";
import { loadConfig } from "../../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadServerEnv();

const app = express();
app.disable("x-powered-by");
if (env.trustProxy > 0) app.set("trust proxy", env.trustProxy);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "data:"],
      imgSrc: ["'self'", "data:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(attachAuth(env));

// Portail d'authentification / CSRF central.
// Tout /api exige auth + CSRF sur les mutations, SAUF :
//   - /api/health
//   - /api/auth/login          (public, rate-limited)
//   - /api/auth/register
app.use((req, res, next) => {
  const p = req.path;
  // Le portail ne protege que /api ; le frontend (statique + SPA) reste serviable.
  if (!p.startsWith("/api")) return next();
  const isPublic =
    p === "/api/health" ||
    p === "/api/auth/login" ||
    p === "/api/auth/register" ||
    p === "/api/auth/check-username" ||
    p === "/api/youtube/callback";
  if (isPublic) return next();
  if (!req.auth) return next(new ApiError(401, "Authentication required"));
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.headers["x-csrf-token"] !== req.auth.csrfToken) {
      return next(new ApiError(403, "Invalid CSRF token"));
    }
  }
  next();
});

// Sante : declaree AVANT les routeurs car l'un d'eux (videos) applique
// un requireAuth global qui bloquerait ce endpoint public.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// API
app.use("/api", authRouter(env));
app.use("/api", backgroundsRouter(env));
app.use("/api", mascotRouter(env));
app.use("/api", workflowRouter(env));
app.use("/api", projectsRouter(env));
app.use("/api", audioRouter(env));
app.use("/api", videosRouter(env));
app.use("/api", youtubeRouter(env));
app.use("/api", automationRouter(env));
app.use("/api", musicRouter(env));
app.use("/api", sfxRouter(env));

// Statique React + fallback SPA
const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(path.join(webDist, "index.html"))) {
  app.use(express.static(webDist, { index: false }));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(webDist, "index.html"));
    }
    next();
  });
}

// Gestion d'erreurs centralisee (messages generiques, jamais de stack au client)
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Erreur de parsing JSON => requerant invalide (400), pas une erreur interne.
  const status =
    (err as { status?: number; type?: string })?.type === "entity.parse.failed" ? 400
    : (err as { status?: number })?.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Internal error" : "Invalid request" });
});

// Seed admin au demarrage (si absent) + log
const seedMsg = await seedAdmin(env);
console.log(`[db] ${seedMsg}`);

// Purge automatique : videos non gardees (bibliotheque) de plus de 24h -> fichiers + lignes.
// Limite le stockage : seule ce qui est garde reste, le reste est recycle.
function purgeUnkeptVideos(): void {
  try {
    const rows = dbQuery(
      env,
      "SELECT id, project_id, file_name FROM videos WHERE kept = 0 AND created_at < datetime('now', '-1 day')",
    ).all() as { id: number; project_id: number; file_name: string }[];
    for (const r of rows) {
      try {
        fs.rmSync(path.resolve(loadConfig().outputDir, "projects", String(r.project_id), r.file_name), { force: true });
      } catch {
        /* fichier deja absent */
      }
      dbQuery(env, "DELETE FROM videos WHERE id = ?", [r.id]).run();
    }
    if (rows.length > 0) console.log(`[purge] ${rows.length} unkept video(s) deleted`);
  } catch (e) {
    console.error("[purge] error", e);
  }
}
purgeUnkeptVideos();
setInterval(purgeUnkeptVideos, 60 * 60 * 1000).unref?.();

// Scheduler d'automatisation : genere et publie seul les videos selon les regles.
// Tick toutes les minutes ; premiere evaluation au demarrage (initialise les creneaux).
function tick(): void {
  tickAutomation(env).catch((e) => console.error("[automation] tick error", e));
}
tick();
setInterval(tick, 60 * 1000).unref?.();

// Stats YouTube (vues/likes/commentaires) : rafraichies toutes les 6h.
// Premier run 60s apres le demarrage (laisse le boot se terminer). Jamais bloquant.
function tickStats(): void {
  refreshAllVideoStats(env).catch((e) => console.error("[ytstats] tick error", e));
}
setTimeout(tickStats, 60 * 1000).unref?.();
setInterval(tickStats, 6 * 60 * 60 * 1000).unref?.();

app.listen(env.port, () => {
  console.log(`[server] DANTI_CLIPER up at http://localhost:${env.port}`);
});
