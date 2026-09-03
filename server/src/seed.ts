import type { ServerEnv } from "./lib/env.js";
import { getDb } from "./db/db.js";
import { hashPassword } from "./auth/passwords.js";

interface Db {
  prepare(s: string): {
    get(...p: unknown[]): Record<string, unknown> | undefined;
    run(...p: unknown[]): { lastInsertRowid: string | number; changes: number };
  };
}

/**
 * Cree (ou met a jour si force) l'utilisateur admin depuis l'env.
 * Retourne un message de statut.
 */
export async function seedAdmin(env: ServerEnv, force = false): Promise<string> {
  if (!env.adminUsername || !env.adminPassword) {
    return "Config admin absente : renseigne ADMIN_USERNAME et ADMIN_PASSWORD dans .env";
  }
  if (env.adminPassword.length < 8) {
    return "ADMIN_PASSWORD trop court (minimum 8 caracteres)";
  }

  const db = getDb(env) as unknown as Db;
  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(env.adminUsername);
  const hash = await hashPassword(env.adminPassword);

  if (existing && !force) {
    return "Admin deja present : ok (mode non force, mot de passe inchange)";
  }
  db.prepare(
    "INSERT INTO users (username, password_hash) VALUES (?, ?) " +
      "ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash",
  ).run(env.adminUsername, hash);
  return "Admin cree/mis a jour : " + env.adminUsername;
}
