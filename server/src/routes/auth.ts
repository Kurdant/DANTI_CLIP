import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import type { ServerEnv } from "../lib/env.js";
import { getDb } from "../db/db.js";
import { dbQuery, asyncHandler, ApiError, loginRateLimit, requireAuth, csrfProtect, resetLoginAttempts } from "../auth/middleware.js";
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
        const msg = parsed.error.issues[0]?.message ?? "Invalid data";
        throw new ApiError(400, msg);
      }
      const { username, password } = parsed.data;

      const existing = dbQuery(env, "SELECT id FROM users WHERE username = ?", [username]).get();
      if (existing) throw new ApiError(400, "This username is not available");

      const hash = await hashPassword(password);
      const info = dbQuery(env, "INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hash]).run();
      const resetLoginAttemptsReq = req;

      const session = createSession(env, Number(info.lastInsertRowid));
      resetLoginAttempts(resetLoginAttemptsReq);
      setSessionCookie(res, session.token, env);

      res.status(201).json({ user: { username } });
    }),
  );

  // Vérification en direct : le pseudo est-il déjà pris ? (public, léger)
  router.get("/auth/check-username", asyncHandler(async (req, res) => {
    const raw = String(req.query.username ?? "");
    const username = raw.trim();
    if (username.length < 3 || username.length > 30) {
      res.json({ available: false });
      return;
    }
    const existing = dbQuery(env, "SELECT id FROM users WHERE username = ?", [username]).get();
    res.json({ available: !existing });
  }));

  router.post(
    "/auth/login",
    loginRateLimit,
    asyncHandler(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, "Invalid data");
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
        throw new ApiError(401, "Invalid credentials");
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

  // Droit à l'effacement : suppression définitive du compte + fichiers associés.
  router.delete("/auth/account", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;

    const projectRows = dbQuery(env, "SELECT id FROM projects WHERE user_id = ?", [userId]).all() as { id: number }[];
    for (const p of projectRows) {
      const dir = path.resolve(env.outputDir, "projects", String(p.id));
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* dossier absent déjà supprimé : on continue */
      }
    }

    const bgDir = path.resolve(env.userBackgroundsDir, String(userId));
    try {
      fs.rmSync(bgDir, { recursive: true, force: true });
    } catch {
      /* dossier absent : on continue */
    }

    const thumbsDir = path.resolve(env.outputDir, "thumbs");
    const prefix = `t_u${userId}_`;
    try {
      for (const f of fs.readdirSync(thumbsDir)) {
        if (!f.startsWith(prefix)) continue;
        try {
          fs.rmSync(path.join(thumbsDir, f), { force: true });
        } catch {
          /* miniature en cours d'utilisation : on continue */
        }
      }
    } catch {
      /* répertoire thumbs absent : on continue */
    }

    dbQuery(env, "DELETE FROM users WHERE id = ?", [userId]).run();

    const token = req.cookies?.[env.cookieSecure ? "__Host-dcli" : "dcli"];
    if (typeof token === "string") destroySession(env, token);
    clearSessionCookie(res, env);
    res.json({ ok: true });
  }));

  router.get("/auth/me", requireAuth, asyncHandler(async (req, res) => {
    const user = getUser(env, req.auth!.userId);
    if (!user) throw new ApiError(401, "Authentication required");
    res.json({ user: { username: user.username }, csrfToken: req.auth!.csrfToken });
  }));

  return router;
}
