import { Router } from "express";
import type { ServerEnv } from "../lib/env.js";
import { getDb } from "../db/db.js";
import { dbQuery, asyncHandler, ApiError, loginRateLimit, requireAuth, resetLoginAttempts } from "../auth/middleware.js";
import { verifyPasswordOrDummy, hashPassword } from "../auth/passwords.js";
import { createSession, destroySession, getUser, setSessionCookie, clearSessionCookie } from "../auth/sessions.js";
import { loginSchema, registerSchema } from "../validate/schemas.js";

export function authRouter(env: ServerEnv): Router {
  const router = Router();

  // --- Inscription de compte (auto-login) ---
  router.post(
    "/auth/register",
    loginRateLimit,
    asyncHandler(async (req, res) => {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "Donnees invalides";
        throw new ApiError(400, msg);
      }
      const { username, password } = parsed.data;

      const existing = dbQuery(env, "SELECT id FROM users WHERE username = ?", [username]).get();
      if (existing) throw new ApiError(400, "Ce nom d'utilisateur n'est pas disponible");

      const hash = await hashPassword(password);
      const info = dbQuery(env, "INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hash]).run();
      const resetLoginAttemptsReq = req;

      const session = createSession(env, Number(info.lastInsertRowid));
      resetLoginAttempts(resetLoginAttemptsReq);
      setSessionCookie(res, session.token, env);

      res.status(201).json({ user: { username } });
    }),
  );

  router.post(
    "/auth/login",
    loginRateLimit,
    asyncHandler(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, "Donnees invalides");
      }
      const { username, password } = parsed.data;

      const row = dbQuery(
        env,
        "SELECT id, password_hash FROM users WHERE username = ?",
        [username],
      ).get() as { id: number; password_hash: string } | undefined;

      // Message unique + timing egalise : ne revele pas si le compte existe.
      const valid = await verifyPasswordOrDummy(password, row?.password_hash ?? null);
      if (!valid) {
        throw new ApiError(401, "Identifiants invalides");
      }

      const session = createSession(env, Number(row!.id));
      resetLoginAttempts(req);
      setSessionCookie(res, session.token, env);

      res.json({ user: { username } });
    }),
  );

  router.post("/auth/logout", requireAuth, asyncHandler(async (req, res) => {
    const token = req.cookies?.[env.cookieSecure ? "__Host-dcli" : "dcli"];
    if (typeof token === "string") destroySession(env, token);
    clearSessionCookie(res, env);
    res.json({ ok: true });
  }));

  router.get("/auth/me", requireAuth, asyncHandler(async (req, res) => {
    const user = getUser(env, req.auth!.userId);
    if (!user) throw new ApiError(401, "Authentification requise");
    res.json({ user: { username: user.username }, csrfToken: req.auth!.csrfToken });
  }));

  return router;
}
