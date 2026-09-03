import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getDb } from "../db/db.js";
import type { ServerEnv } from "../lib/env.js";
import { validateSession } from "./sessions.js";

/** Erreur portant un statut HTTP + message pense pour l'utilisateur. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Wrap async pour propager les erreurs au middleware global. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

function getToken(req: Request): string | null {
  const name = req.env?.cookieSecure ? "__Host-dcli" : "dcli";
  const val = req.cookies?.[name];
  return typeof val === "string" && val.length > 0 ? val : null;
}

/** Authentifie la requete depuis la cookie de session (attache req.auth). */
export const attachAuth: (env: ServerEnv) => RequestHandler =
  (env) =>
  (req, _res, next) => {
    req.env = env;
    const token = getToken(req);
    if (token) {
      const session = validateSession(env, token);
      if (session) req.auth = session;
    }
    next();
  };

/** Exige une authentification valide. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    return next(new ApiError(401, "Authentification requise"));
  }
  next();
};

/** Exige un token CSRF valide pour les requetes de modification. */
export const csrfProtect: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new ApiError(401, "Authentification requise"));
  const methods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  if (methods.has(req.method)) {
    const header = req.headers["x-csrf-token"];
    if (typeof header !== "string" || header !== req.auth.csrfToken) {
      return next(new ApiError(403, "Jeton CSRF invalide"));
    }
  }
  next();
};

interface Attempt {
  count: number;
  resetAt: number;
}
const loginAttempts = new Map<string, Attempt>();
const MAX_LOGIN = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Purge periodique des entrees expirees (evite la croissance memoire illimitee).
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of loginAttempts) {
    if (a.resetAt <= now) loginAttempts.delete(ip);
  }
}, 60_000);
cleanupTimer.unref?.();

/** Limiteur de tentatives de connexion par IP (anti brute-force). */
export const loginRateLimit: RequestHandler = (req, _res, next) => {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && entry.resetAt <= now) {
    loginAttempts.delete(ip);
  }
  const current = loginAttempts.get(ip);
  if (current && current.count >= MAX_LOGIN) {
    return next(new ApiError(429, "Trop de tentatives. Reessayez dans 15 minutes."));
  }
  if (current) {
    current.count += 1;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }
  next();
};

/** Reinitialise le compteur apres un login reussi. */
export function resetLoginAttempts(req: Request): void {
  const ip = req.ip ?? "unknown";
  loginAttempts.delete(ip);
}

// Requetes SQLites parametrees : jamais de concatenation.
// dbQuery(env, sql, params) retourne un objet dont get/run/all acceptent
// soit les params passes a dbQuery (via closure), soit fournis directement.
export function dbQuery(env: ServerEnv, sql: string, params: unknown[] = []) {
  const stmt = (getDb(env) as unknown as {
    prepare(s: string): {
      get(...p: unknown[]): Record<string, unknown> | undefined;
      run(...p: unknown[]): { lastInsertRowid: string | number; changes: number };
      all(...p: unknown[]): Record<string, unknown>[];
    };
  }).prepare(sql);
  return {
    get: (...a: unknown[]) => stmt.get(...(a.length ? a : params)),
    run: (...a: unknown[]) => stmt.run(...(a.length ? a : params)),
    all: (...a: unknown[]) => stmt.all(...(a.length ? a : params)),
  };
}
