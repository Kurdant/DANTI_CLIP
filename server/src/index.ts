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
import { audioRouter } from "./routes/audio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadServerEnv();

const app = express();
app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
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
//   - GET /api/backgrounds*     (ressources statiques non sensibles)
app.use((req, res, next) => {
  const p = req.path;
  // Le portail ne protege que /api ; le frontend (statique + SPA) reste serviable.
  if (!p.startsWith("/api")) return next();
  const isPublic =
    p === "/api/health" ||
    p === "/api/auth/login" ||
    (req.method === "GET" && p.startsWith("/api/backgrounds"));
  if (isPublic) return next();
  if (!req.auth) return next(new ApiError(401, "Authentification requise"));
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.headers["x-csrf-token"] !== req.auth.csrfToken) {
      return next(new ApiError(403, "Jeton CSRF invalide"));
    }
  }
  next();
});

// API
app.use("/api", authRouter(env));
app.use("/api", backgroundsRouter(env));
app.use("/api", workflowRouter(env));
app.use("/api", projectsRouter(env));
app.use("/api", audioRouter(env));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
  console.error(err);
  res.status(500).json({ error: "Erreur interne" });
});

// Seed admin au demarrage (si absent) + log
const seedMsg = seedAdmin(env);
console.log(`[db] ${seedMsg}`);

app.listen(env.port, () => {
  console.log(`[server] DANTI_CLIPER up sur http://localhost:${env.port}`);
});
