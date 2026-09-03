import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ServerEnv } from "../lib/env.js";

let db: DatabaseSync | null = null;

/**
 * Ouvre la base SQLite (node:sqlite natif) et applique le schéma.
 * WAL + foreign_keys pour la robustesse.
 */
export function getDb(env: ServerEnv): DatabaseSync {
  if (db) return db;
  mkdirSync(path.dirname(env.dbPath), { recursive: true });

  const instance = new DatabaseSync(env.dbPath);
  instance.exec("PRAGMA journal_mode = WAL;");
  instance.exec("PRAGMA foreign_keys = ON;");
  instance.exec("PRAGMA busy_timeout = 5000;");

  instance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT UNIQUE NOT NULL,
      csrf_token  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title                TEXT NOT NULL,
      topic                TEXT NOT NULL,
      mode                 TEXT NOT NULL CHECK (mode IN ('auto','manual')),
      status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','ideas','script','voice','done')),
      selected_idea_id     INTEGER,
      selected_script_id   INTEGER,
      selected_voice_id    INTEGER,
      selected_background  TEXT,
      text_style           TEXT NOT NULL DEFAULT 'classic',
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      position   INTEGER NOT NULL,
      idea_text  TEXT NOT NULL,
      titre      TEXT,
      hook       TEXT,
      angle      TEXT,
      fond       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      script_json  TEXT NOT NULL,
      validated    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS voices (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      script_id  INTEGER REFERENCES scripts(id) ON DELETE SET NULL,
      voice_name TEXT NOT NULL,
      file_name  TEXT NOT NULL,
      subs_file  TEXT,
      wb_file    TEXT,
      duration   REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS videos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_name  TEXT NOT NULL,
      duration   REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_user   ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_ideas_project   ON ideas(project_id);
    CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);
    CREATE INDEX IF NOT EXISTS idx_voices_project  ON voices(project_id);
    CREATE INDEX IF NOT EXISTS idx_videos_project  ON videos(project_id);
  `);

  // Migration : ajoute la colonne `titre` si elle n'existe pas (base existante).
  const ideaCols = instance.prepare("PRAGMA table_info(ideas)").all() as { name: string }[];
  if (!ideaCols.some((c) => c.name === "titre")) {
    instance.exec("ALTER TABLE ideas ADD COLUMN titre TEXT;");
  }
  // Migration : ajoute la colonne `subs_file` si elle n'existe pas.
  const voiceCols = instance.prepare("PRAGMA table_info(voices)").all() as { name: string }[];
  if (!voiceCols.some((c) => c.name === "subs_file")) {
    instance.exec("ALTER TABLE voices ADD COLUMN subs_file TEXT;");
  }
  if (!voiceCols.some((c) => c.name === "wb_file")) {
    instance.exec("ALTER TABLE voices ADD COLUMN wb_file TEXT;");
  }
  // Migration : ajoute la colonne `text_style` si elle n'existe pas.
  const projCols = instance.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projCols.some((c) => c.name === "text_style")) {
    instance.exec("ALTER TABLE projects ADD COLUMN text_style TEXT NOT NULL DEFAULT 'classic';");
  }

  db = instance;
  return instance;
}

/** Pour les tests : referme la connexion. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
