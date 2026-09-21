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
      video_type           TEXT NOT NULL DEFAULT 'culture-generale',
      music_enabled        INTEGER NOT NULL DEFAULT 0,
      music_track          TEXT,
      music_volume         REAL,
      sfx_enabled          INTEGER NOT NULL DEFAULT 1,
      sfx_intro            TEXT,
      sfx_volume           REAL,
      effects_enabled      INTEGER NOT NULL DEFAULT 1,
      broll_enabled        INTEGER NOT NULL DEFAULT 1,
      voice_rate           REAL,
      voice_pitch          REAL,
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
      rate       TEXT,
      pitch      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS videos (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_name        TEXT NOT NULL,
      duration         REAL,
      kept             INTEGER NOT NULL DEFAULT 0,
      title            TEXT,
      description      TEXT,
      tags             TEXT,
      youtube_id       TEXT,
      views            INTEGER,
      likes            INTEGER,
      comments         INTEGER,
      stats_updated_at TEXT,
      stats_status     TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS youtube_tokens (
      user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      access_token  TEXT NOT NULL,
      refresh_token TEXT,
      expires_at    TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS youtube_creds (
      user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cred_enc    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_topics (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, topic)
    );

    CREATE TABLE IF NOT EXISTS tts_usage (
      month TEXT PRIMARY KEY,
      chars INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS automations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      enabled      INTEGER NOT NULL DEFAULT 1,
      video_types  TEXT NOT NULL DEFAULT '["culture-generale"]',
      per_day      INTEGER NOT NULL DEFAULT 1,
      schedule     TEXT NOT NULL,
      voice_name   TEXT,
      background   TEXT,
      text_style   TEXT NOT NULL DEFAULT 'classic',
      topic        TEXT NOT NULL DEFAULT '',
      privacy      TEXT NOT NULL DEFAULT 'unlisted',
      timezone     TEXT NOT NULL DEFAULT 'UTC',
      music_enabled   INTEGER NOT NULL DEFAULT 0,
      music_track     TEXT,
      music_volume    REAL,
      sfx_enabled     INTEGER NOT NULL DEFAULT 1,
      sfx_intro       TEXT,
      sfx_volume      REAL,
      effects_enabled INTEGER NOT NULL DEFAULT 1,
      broll_enabled   INTEGER NOT NULL DEFAULT 1,
      voice_rate      REAL,
      voice_pitch     REAL,
      next_run_at  TEXT,
      last_run_at  TEXT,
      last_result  TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_user   ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_automations_user ON automations(user_id);
    CREATE INDEX IF NOT EXISTS idx_ideas_project   ON ideas(project_id);
    CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);
    CREATE INDEX IF NOT EXISTS idx_voices_project  ON voices(project_id);
    CREATE INDEX IF NOT EXISTS idx_videos_project  ON videos(project_id);
    CREATE INDEX IF NOT EXISTS idx_user_topics_user ON user_topics(user_id);

    -- ------------------------------------------------------------
    -- CONTENT ENGINE (lot 3) : candidats de sujets, hooks, categories.
    -- Migration additive : ne modifie aucune table existante.
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS topic_candidates (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id               INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      title                    TEXT NOT NULL,
      idea_text                TEXT NOT NULL,
      angle                    TEXT NOT NULL DEFAULT '',
      source                   TEXT NOT NULL DEFAULT 'llm',
      source_url               TEXT,
      demand_score             REAL,
      curiosity_score          REAL,
      emotional_impact_score   REAL,
      novelty_score            REAL,
      visual_score             REAL,
      comment_score            REAL,
      share_score              REAL,
      search_score             REAL,
      audience_relevance_score REAL,
      credibility_score        REAL,
      saturation_score         REAL,
      banality_score           REAL,
      follow_up_score          REAL,
      total_score              REAL,
      score_version            INTEGER NOT NULL DEFAULT 1,
      score_detail             TEXT,
      status                   TEXT NOT NULL DEFAULT 'candidate'
                             CHECK (status IN ('candidate','selected','rejected','used')),
      created_at               TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_topic_candidates_user    ON topic_candidates(user_id);
    CREATE INDEX IF NOT EXISTS idx_topic_candidates_project ON topic_candidates(project_id);

    CREATE TABLE IF NOT EXISTS hooks (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_candidate_id     INTEGER NOT NULL REFERENCES topic_candidates(id) ON DELETE CASCADE,
      hook_text              TEXT NOT NULL,
      pattern                TEXT,
      curiosity_score        REAL,
      clarity_score          REAL,
      specificity_score      REAL,
      surprise_score         REAL,
      emotional_impact_score REAL,
      open_loop_score        REAL,
      credibility_score      REAL,
      scroll_stopping_score  REAL,
      total_score            REAL,
      score_version          INTEGER NOT NULL DEFAULT 1,
      score_detail           TEXT,
      status                 TEXT NOT NULL DEFAULT 'candidate'
                           CHECK (status IN ('candidate','selected','rejected')),
      created_at             TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_hooks_candidate ON hooks(topic_candidate_id);

    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT UNIQUE NOT NULL,
      label       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS topic_categories (
      topic_candidate_id INTEGER NOT NULL REFERENCES topic_candidates(id) ON DELETE CASCADE,
      category_id        INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (topic_candidate_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS video_categories (
      video_id    INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (video_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS video_stats (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id    INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      views       INTEGER,
      likes       INTEGER,
      comments    INTEGER,
      source      TEXT NOT NULL DEFAULT 'youtube_data_api',
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_video_stats_video ON video_stats(video_id);

    -- Recommandations de contenu persistees (traçabilite des decisions).
    CREATE TABLE IF NOT EXISTS content_decisions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      decision_json TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_content_decisions_user ON content_decisions(user_id);

    -- Familles de contenu (phase 14) : seed stable, multi-categories par contenu.
    INSERT OR IGNORE INTO categories (slug, label) VALUES
      ('body', 'Body'),
      ('psychology', 'Psychology'),
      ('animals', 'Animals'),
      ('space', 'Space'),
      ('everyday_science', 'Everyday Science'),
      ('tech', 'Tech'),
      ('weird_history', 'Weird History'),
      ('dangerous_science', 'Dangerous Science'),
      ('human_behavior', 'Human Behavior'),
      ('nature', 'Nature');
  `);

  // Seed memoire des sujets : alimente `user_topics` avec les sujets deja
  // traites (idees existantes) pour que l'IA ne les re-propose pas. INSERT OR
  // IGNORE : sans doublon, re-execution sans effet dans une migration.
  instance.exec(`
    INSERT OR IGNORE INTO user_topics (user_id, topic)
    SELECT p.user_id, i.idea_text
    FROM ideas i
    JOIN projects p ON p.id = i.project_id;
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
  // Migration : ajoute la colonne `video_type` (type de video du projet) si elle n'existe pas.
  const projCols2 = instance.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projCols2.some((c) => c.name === "video_type")) {
    instance.exec("ALTER TABLE projects ADD COLUMN video_type TEXT NOT NULL DEFAULT 'culture-generale';");
  }
  // Migration : ajoute la colonne `mascot_file` (PNG mascotte du compte) si absente.
  const userCols = instance.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols.some((c) => c.name === "mascot_file")) {
    instance.exec("ALTER TABLE users ADD COLUMN mascot_file TEXT;");
  }
  // Migration : ajoute la colonne `kept` (bibliotheque) si elle n'existe pas.
  const videoCols = instance.prepare("PRAGMA table_info(videos)").all() as { name: string }[];
  if (!videoCols.some((c) => c.name === "kept")) {
    instance.exec("ALTER TABLE videos ADD COLUMN kept INTEGER NOT NULL DEFAULT 0;");
  }
  // Migration : colonnes de publication YouTube (titre / description / tags) si absentes.
  if (!videoCols.some((c) => c.name === "title")) {
    instance.exec("ALTER TABLE videos ADD COLUMN title TEXT;");
  }
  if (!videoCols.some((c) => c.name === "description")) {
    instance.exec("ALTER TABLE videos ADD COLUMN description TEXT;");
  }
  if (!videoCols.some((c) => c.name === "tags")) {
    instance.exec("ALTER TABLE videos ADD COLUMN tags TEXT;");
  }
  // Migration : ajoute la colonne `youtube_id` (id YouTube de la video publiee) si absente.
  if (!videoCols.some((c) => c.name === "youtube_id")) {
    instance.exec("ALTER TABLE videos ADD COLUMN youtube_id TEXT;");
  }
  // Migration : ajoute la colonne `timezone` (fuseau des creneaux) sur automations si absente.
  const autoCols = instance.prepare("PRAGMA table_info(automations)").all() as { name: string }[];
  if (!autoCols.some((c) => c.name === "timezone")) {
    instance.exec("ALTER TABLE automations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';");
  }

  // Migration : options de rendu (musique / effets / b-roll) + reglages voix.
  const ensureCol = (table: string, col: string, ddl: string): void => {
    const cols = instance.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === col)) instance.exec(ddl);
  };
  ensureCol("projects", "music_enabled", "ALTER TABLE projects ADD COLUMN music_enabled INTEGER NOT NULL DEFAULT 0;");
  ensureCol("projects", "music_track", "ALTER TABLE projects ADD COLUMN music_track TEXT;");
  ensureCol("projects", "music_volume", "ALTER TABLE projects ADD COLUMN music_volume REAL;");
  ensureCol("projects", "sfx_enabled", "ALTER TABLE projects ADD COLUMN sfx_enabled INTEGER NOT NULL DEFAULT 1;");
  ensureCol("projects", "sfx_intro", "ALTER TABLE projects ADD COLUMN sfx_intro TEXT;");
  ensureCol("projects", "sfx_volume", "ALTER TABLE projects ADD COLUMN sfx_volume REAL;");
  ensureCol("projects", "effects_enabled", "ALTER TABLE projects ADD COLUMN effects_enabled INTEGER NOT NULL DEFAULT 1;");
  ensureCol("projects", "broll_enabled", "ALTER TABLE projects ADD COLUMN broll_enabled INTEGER NOT NULL DEFAULT 1;");
  ensureCol("projects", "voice_rate", "ALTER TABLE projects ADD COLUMN voice_rate REAL;");
  ensureCol("projects", "voice_pitch", "ALTER TABLE projects ADD COLUMN voice_pitch REAL;");
  ensureCol("automations", "music_enabled", "ALTER TABLE automations ADD COLUMN music_enabled INTEGER NOT NULL DEFAULT 0;");
  ensureCol("automations", "music_track", "ALTER TABLE automations ADD COLUMN music_track TEXT;");
  ensureCol("automations", "music_volume", "ALTER TABLE automations ADD COLUMN music_volume REAL;");
  ensureCol("automations", "sfx_enabled", "ALTER TABLE automations ADD COLUMN sfx_enabled INTEGER NOT NULL DEFAULT 1;");
  ensureCol("automations", "sfx_intro", "ALTER TABLE automations ADD COLUMN sfx_intro TEXT;");
  ensureCol("automations", "sfx_volume", "ALTER TABLE automations ADD COLUMN sfx_volume REAL;");
  ensureCol("automations", "effects_enabled", "ALTER TABLE automations ADD COLUMN effects_enabled INTEGER NOT NULL DEFAULT 1;");
  ensureCol("automations", "broll_enabled", "ALTER TABLE automations ADD COLUMN broll_enabled INTEGER NOT NULL DEFAULT 1;");
  ensureCol("automations", "voice_rate", "ALTER TABLE automations ADD COLUMN voice_rate REAL;");
  ensureCol("automations", "voice_pitch", "ALTER TABLE automations ADD COLUMN voice_pitch REAL;");
  ensureCol("voices", "rate", "ALTER TABLE voices ADD COLUMN rate TEXT;");
  ensureCol("voices", "pitch", "ALTER TABLE voices ADD COLUMN pitch TEXT;");
  // Migration : statistiques YouTube par video (chantier 2a).
  ensureCol("videos", "views", "ALTER TABLE videos ADD COLUMN views INTEGER;");
  ensureCol("videos", "likes", "ALTER TABLE videos ADD COLUMN likes INTEGER;");
  ensureCol("videos", "comments", "ALTER TABLE videos ADD COLUMN comments INTEGER;");
  ensureCol("videos", "stats_updated_at", "ALTER TABLE videos ADD COLUMN stats_updated_at TEXT;");
  ensureCol("videos", "stats_status", "ALTER TABLE videos ADD COLUMN stats_status TEXT;");
  // Migration : CONTENT ENGINE - liaison videos -> candidat / hook (lot 3).
  ensureCol("videos", "topic_candidate_id", "ALTER TABLE videos ADD COLUMN topic_candidate_id INTEGER REFERENCES topic_candidates(id) ON DELETE SET NULL;");
  ensureCol("videos", "hook_id", "ALTER TABLE videos ADD COLUMN hook_id INTEGER REFERENCES hooks(id) ON DELETE SET NULL;");
  // Migration : CONTENT ENGINE - hook selectionne pour le script (lot 4).
  ensureCol("scripts", "hook_id", "ALTER TABLE scripts ADD COLUMN hook_id INTEGER REFERENCES hooks(id) ON DELETE SET NULL;");
  // Migration : CONTENT ENGINE - langue par compte et par regle (lot 7, revue BYAN M4).
  ensureCol("users", "language", "ALTER TABLE users ADD COLUMN language TEXT;");
  ensureCol("automations", "language", "ALTER TABLE automations ADD COLUMN language TEXT;");

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
