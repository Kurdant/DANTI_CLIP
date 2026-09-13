import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { dbQuery } from "../auth/middleware.js";
import { getProjectRow } from "../lib/serialize.js";
import { loadConfig } from "../../../src/config.js";
import { decryptString, encryptString } from "../lib/crypto.js";
import { refreshUserVideoStats } from "../lib/ytStats.js";

const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const STATE_COOKIE = "yt_state";
const PRIVACY = new Set(["private", "unlisted", "public"]);
/** Categorie YouTube par defaut : 27 = Education (culture generale). */
const DEFAULT_CATEGORY_ID = "27";

interface OAuthCreds {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
}

/** Identifiants OAuth : ceux de l'utilisateur (BYOK) ou ceux de l'operateur. */
function resolveCreds(env: ServerEnv, userId: number): OAuthCreds | null {
  const own = getUserCreds(env, userId);
  if (own) return own;
  if (env.youtubeClientId && env.youtubeClientSecret) {
    return { clientId: env.youtubeClientId, clientSecret: env.youtubeClientSecret, redirectUri: env.youtubeRedirectUri };
  }
  return null;
}

/** Identifiants personnels (BYOK) chiffres en base, dechiffres a la volee. */
function getUserCreds(env: ServerEnv, userId: number): OAuthCreds | null {
  if (!env.secretKey) return null;
  const row = dbQuery(env, "SELECT cred_enc FROM youtube_creds WHERE user_id = ?", [userId]).get() as
    | { cred_enc: string }
    | undefined;
  if (!row) return null;
  const plain = decryptString(row.cred_enc, env.secretKey);
  if (!plain) return null;
  try {
    const parsed = JSON.parse(plain) as OAuthCreds;
    if (parsed.clientId && parsed.clientSecret && parsed.redirectUri) return parsed;
  } catch {
    /* payload invalide : ignore */
  }
  return null;
}

function getToken(env: ServerEnv, userId: number): TokenRow | null {
  const row = dbQuery(
    env,
    "SELECT access_token, refresh_token, expires_at FROM youtube_tokens WHERE user_id = ?",
    [userId],
  ).get() as TokenRow | undefined;
  return row ?? null;
}

async function exchangeCode(creds: OAuthCreds, code: string): Promise<{ access: string; refresh: string | null; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: creds.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error ?? "OAuth code exchange failed");
  return { access: j.access_token, refresh: j.refresh_token ?? null, expiresIn: j.expires_in ?? 3600 };
}

async function refreshAccess(creds: OAuthCreds, refresh: string): Promise<{ access: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error ?? "Token refresh failed");
  return { access: j.access_token, expiresIn: j.expires_in ?? 3600 };
}

/** Renvoie un access token encore valide (refresh si necessaire) ou null. */
async function validAccessToken(env: ServerEnv, userId: number): Promise<string | null> {
  const row = getToken(env, userId);
  const creds = resolveCreds(env, userId);
  if (!row || !creds) return null;
  const expires = new Date(row.expires_at).getTime();
  if (expires > Date.now() + 60_000) return row.access_token;
  if (!row.refresh_token) return null;
  try {
    const { access, expiresIn } = await refreshAccess(creds, row.refresh_token);
    dbQuery(env, "UPDATE youtube_tokens SET access_token = ?, expires_at = ? WHERE user_id = ?", [
      access,
      new Date(Date.now() + expiresIn * 1000).toISOString(),
      userId,
    ]).run();
    return access;
  } catch {
    return null;
  }
}

async function uploadToYoutube(
  access: string,
  filePath: string,
  meta: { title: string; description: string; tags: string[]; privacyStatus: string },
): Promise<{ youtubeId: string; url: string }> {
  const metadata = JSON.stringify({
    snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: DEFAULT_CATEGORY_ID },
    status: { privacyStatus: meta.privacyStatus, selfDeclaredMadeForKids: false },
  });
  const boundary = `dc_${crypto.randomBytes(12).toString("hex")}`;
  const fileBuf = fs.readFileSync(filePath);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: video/mp4\r\nContent-Length: ${fileBuf.length}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, fileBuf, tail]);

  const res = await fetch(`${UPLOAD_URL}?uploadType=multipart&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  const j = (await res.json()) as { id?: string; error?: { message?: string; code?: number } };
  if (!res.ok || !j.id) throw new Error(j.error?.message ?? "YouTube upload failed");
  return { youtubeId: j.id, url: `https://youtu.be/${j.id}` };
}

/** Le compte est-il utilisable pour publier (creds + access token valide/rafraichissable) ? */
export async function isYouTubeConnected(env: ServerEnv, userId: number): Promise<boolean> {
  return Boolean(await validAccessToken(env, userId));
}

/**
 * Publie une video generee vers YouTube, sans passer par HTTP (reutilise par
 * l'automatisation). Verifie la propriete, l'existence du fichier, puis uploade.
 * Applique des fallbacks sur title/description/privacy.
 */
export async function publishVideo(
  env: ServerEnv,
  userId: number,
  videoId: number,
  meta: { title: string; description: string; tags: string[]; privacyStatus: string },
): Promise<{ youtubeId: string; url: string }> {
  const row = dbQuery(env, "SELECT file_name, project_id FROM videos WHERE id = ?", [videoId]).get() as
    | { file_name: string; project_id: number }
    | undefined;
  if (!row) throw new Error("Video not found");
  const project = getProjectRow(env, Number(row.project_id), userId);
  if (!project) throw new Error("Video not found");

  const filePath = path.resolve(loadConfig().outputDir, "projects", String(row.project_id), row.file_name);
  if (!fs.existsSync(filePath)) throw new Error("Video file missing");

  const title = (meta.title?.trim() || project.title || "Short DANTI CLIPER").slice(0, 100);
  // Short : ajoute "#shorts" en fin de description pour garantir le classement Short.
  let description = (meta.description?.trim() || project.topic || "").slice(0, 5000);
  if (!/#shorts/i.test(description)) {
    description = `${description}${description ? "\n\n" : ""}#shorts`.slice(0, 5000);
  }
  const tags = (Array.isArray(meta.tags) ? meta.tags : [])
    .map((t) => String(t).trim()).filter(Boolean);
  if (!tags.some((t) => t.toLowerCase() === "shorts")) tags.push("shorts");
  const finalTags = tags.slice(0, 30);
  const privacyStatus = PRIVACY.has(meta.privacyStatus) ? meta.privacyStatus : "unlisted";

  const access = await validAccessToken(env, userId);
  if (!access) throw new Error("YouTube account not connected");

  const { youtubeId, url } = await uploadToYoutube(access, filePath, { title, description, tags: finalTags, privacyStatus });
  // Suivi : id YouTube + video gardee (jamais purgee apres publication).
  dbQuery(env, "UPDATE videos SET youtube_id = ?, kept = 1 WHERE id = ?", [youtubeId, videoId]).run();
  return { youtubeId, url };
}

export function youtubeRouter(env: ServerEnv): Router {
  const router = Router();

  // --- Statut : config present ? compte connecte ? identifiants perso ? ---
  router.get("/youtube/status", requireAuth, asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    res.json({
      configured: Boolean(resolveCreds(env, userId)),
      connected: Boolean(getToken(env, userId)),
      hasOwnCredentials: Boolean(getUserCreds(env, userId)),
    });
  }));

  // --- Enregistrer ses propres identifiants OAuth (BYOK, chiffres en base) ---
  router.post("/youtube/credentials", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    if (!env.secretKey) throw new ApiError(400, "BYOK disabled (missing SECRET_KEY)");
    const clientId = String(req.body?.clientId ?? "").trim();
    const clientSecret = String(req.body?.clientSecret ?? "").trim();
    if (!clientId.includes(".apps.googleusercontent.com") || clientId.length < 20) {
      throw new ApiError(400, "Invalid client ID (format: xxx.apps.googleusercontent.com)");
    }
    if (clientSecret.length < 16) throw new ApiError(400, "Invalid client secret (too short)");
    const redirectUri = env.youtubeRedirectUri;
    const payload = JSON.stringify({ clientId, clientSecret, redirectUri });
    dbQuery(
      env,
      "INSERT INTO youtube_creds (user_id, cred_enc) VALUES (?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET cred_enc = excluded.cred_enc, updated_at = datetime('now')",
      [req.auth!.userId, encryptString(payload, env.secretKey)],
    ).run();
    res.json({ ok: true });
  }));

  // --- Retirer ses propres identifiants ---
  router.delete("/youtube/credentials", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    dbQuery(env, "DELETE FROM youtube_creds WHERE user_id = ?", [req.auth!.userId]).run();
    res.json({ ok: true });
  }));

  // --- Debut OAuth : redirige vers Google (identifiants perso ou operateur) ---
  router.get("/youtube/auth", requireAuth, asyncHandler(async (req, res) => {
    const creds = resolveCreds(env, req.auth!.userId);
    if (!creds) throw new ApiError(400, "YouTube not configured (missing credentials)");
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.cookieSecure,
      path: "/",
      maxAge: 10 * 60 * 1000,
    });
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", creds.clientId);
    url.searchParams.set("redirect_uri", creds.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  }));

  // --- Retour OAuth : echange code -> tokens, sauvegarde, redirection ---
  router.get("/youtube/callback", asyncHandler(async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const cookieState = req.cookies?.[STATE_COOKIE];
    if (!code || !state || state !== cookieState) {
      return res.redirect("/dashboard?yterr=1");
    }
    res.clearCookie(STATE_COOKIE, { path: "/" });
    if (!req.auth) return res.redirect("/login");
    const creds = resolveCreds(env, req.auth.userId);
    if (!creds) return res.redirect("/dashboard?yterr=1");
    try {
      const { access, refresh, expiresIn } = await exchangeCode(creds, code);
      dbQuery(
        env,
        "INSERT INTO youtube_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token, " +
          "refresh_token = COALESCE(excluded.refresh_token, youtube_tokens.refresh_token), " +
          "expires_at = excluded.expires_at, updated_at = datetime('now')",
        [req.auth.userId, access, refresh, new Date(Date.now() + expiresIn * 1000).toISOString()],
      ).run();
      res.redirect("/dashboard?ytok=1");
    } catch {
      res.redirect("/dashboard?yterr=1");
    }
  }));

  // --- Deconnexion (retire les tokens) ---
  router.post("/youtube/disconnect", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    dbQuery(env, "DELETE FROM youtube_tokens WHERE user_id = ?", [req.auth!.userId]).run();
    res.json({ ok: true });
  }));

  // --- Rafraichir les stats (vues/likes/commentaires) des videos publiees ---
  const lastStatsRefresh = new Map<number, number>();
  router.post("/youtube/stats/refresh", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const last = lastStatsRefresh.get(userId) ?? 0;
    if (Date.now() - last < 5 * 60 * 1000) {
      throw new ApiError(429, "Please wait a few minutes before refreshing stats again");
    }
    lastStatsRefresh.set(userId, Date.now());
    const result = await refreshUserVideoStats(env, userId);
    res.json({ ok: true, ...result });
  }));

  // --- Upload d'une video generee vers YouTube ---
  router.post("/youtube/upload", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    if (!resolveCreds(env, userId)) throw new ApiError(400, "YouTube not configured (missing credentials)");

    const videoId = Number(req.body?.videoId);
    if (!Number.isInteger(videoId) || videoId <= 0) throw new ApiError(400, "Invalid video");

    const meta = {
      title: String(req.body?.title ?? "").trim(),
      description: String(req.body?.description ?? "").trim(),
      tags: Array.isArray(req.body?.tags) ? (req.body.tags as unknown[]).map(String) : [],
      privacyStatus: String(req.body?.privacyStatus ?? "unlisted"),
    };

    try {
      const { youtubeId, url } = await publishVideo(env, userId, videoId, meta);
      res.json({ ok: true, youtubeId, url });
    } catch (e) {
      console.error("[youtube] upload failed:", e);
      const msg = e instanceof Error ? e.message : "YouTube upload failed";
      const status = msg.includes("not connected") ? 401 : msg.includes("not found") || msg.includes("missing") ? 404 : 502;
      throw new ApiError(status, msg);
    }
  }));

  return router;
}
