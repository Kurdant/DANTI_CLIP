import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { getDb } from "../db/db.js";
import type { ServerEnv } from "../lib/env.js";

interface DbConnection {
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): { lastInsertRowid: string | number };
  };
}

const COOKIE_NAME = "dcli";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface SessionData {
  userId: number;
  csrfToken: string;
}

interface UserRow {
  id: number;
  username: string;
}

/** Cree une session serveur (token aleatoire, hash en BDD) et renvoie le couple token/CSRF. */
export function createSession(env: ServerEnv, userId: number): { token: string; csrfToken: string } {
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(24).toString("hex");
  const tokenHash = sha256(token);
  const expires = new Date(Date.now() + env.sessionDays * 24 * 3600 * 1000).toISOString();

  (getDb(env) as unknown as DbConnection)
    .prepare("INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at) VALUES (?, ?, ?, ?)")
    .run(userId, tokenHash, csrfToken, expires);

  return { token, csrfToken };
}

/** Valide un token de session ; renvoie les donnees si valide, sinon null. */
export function validateSession(env: ServerEnv, token: string): SessionData | null {
  const tokenHash = sha256(token);
  const row = (getDb(env) as unknown as DbConnection)
    .prepare(
      "SELECT user_id, csrf_token, expires_at FROM sessions WHERE token_hash = ?",
    )
    .get(tokenHash) as { user_id: number; csrf_token: string; expires_at: string } | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(env, token);
    return null;
  }
  return { userId: row.user_id, csrfToken: row.csrf_token };
}

/** Supprime une session (logout). */
export function destroySession(env: ServerEnv, token: string): void {
  (getDb(env) as unknown as DbConnection)
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .run(sha256(token));
}

export function getUser(env: ServerEnv, userId: number): UserRow | null {
  const row = (getDb(env) as unknown as DbConnection)
    .prepare("SELECT id, username FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;
  return row ? { id: Number(row.id), username: row.username } : null;
}

/** Pose le cookie de session (HttpOnly + SameSite=Strict, + Secure en prod). */
export function setSessionCookie(res: Response, token: string, env: ServerEnv): void {
  const name = env.cookieSecure ? `__Host-${COOKIE_NAME}` : COOKIE_NAME;
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.cookieSecure,
    path: "/",
    maxAge: env.sessionDays * 24 * 3600 * 1000,
  });
}

export function clearSessionCookie(res: Response, env: ServerEnv): void {
  const name = env.cookieSecure ? `__Host-${COOKIE_NAME}` : COOKIE_NAME;
  res.clearCookie(name, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: env.cookieSecure,
  });
}
