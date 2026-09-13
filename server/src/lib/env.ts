import "dotenv/config";
import path from "node:path";

export interface ServerEnv {
  port: number;
  dataDir: string;
  dbPath: string;
  outputDir: string;
  backgroundsDir: string;
  /** Repertoire des fonds video uploadees par les utilisateurs (par sous-dossier userId). */
  userBackgroundsDir: string;
  /** Repertoire des mascottes PNG uploadees par les utilisateurs (par sous-dossier userId). */
  userMascotsDir: string;
  /** Quota de stockage (octets) des fonds video d'un utilisateur. */
  userBgQuotaBytes: number;
  /** Cookies Secure (HTTPS). A mettre a true en production. */
  cookieSecure: boolean;
  /** Nombre de proxies devant l'app (0 = direct). Definir >=1 derriere nginx/Caddy/Cloudflare. */
  trustProxy: number;
  adminUsername: string;
  adminPassword: string;
  sessionDays: number;
  /** YouTube Data API v3 : identifiants OAuth (laisses vides = fonctionnalite desactivee). */
  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeRedirectUri: string;
  /** Cle API YouTube Data (statistiques des videos publiques). Vide = stats desactivees. */
  youtubeApiKey: string;
  /** Cle de chiffrement des secrets d'utilisateurs (BYOK). */
  secretKey: string;
  /** Cle API Pexels (images libres de droits, piste B). Vide = piste B desactivee. */
  pexelsApiKey: string;
  /** Repertoire des musiques de fond libres (pistes audio). */
  musicDir: string;
  /** Repertoire des sound effects (impacts, dings) utilises dans le montage. */
  sfxDir: string;
}

function read(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

export function loadServerEnv(): ServerEnv {
  const dataDir = read("DATA_DIR", "data");
  return {
    port: Number(read("PORT", "3001")) || 3001,
    dataDir,
    dbPath: read("DB_PATH", `${dataDir}/danticliper.db`),
    outputDir: read("OUTPUT_DIR", "output"),
    backgroundsDir: read("BACKGROUNDS_DIR", "assets/backgrounds"),
    userBackgroundsDir: read("USER_BACKGROUNDS_DIR", path.join(dataDir, "uploads", "backgrounds")),
    userMascotsDir: read("USER_MASCOTS_DIR", path.join(dataDir, "uploads", "mascots")),
    userBgQuotaBytes: Number(read("USER_BG_QUOTA_BYTES", String(1024 * 1024 * 1024))) || 1024 * 1024 * 1024,
    cookieSecure: read("COOKIE_SECURE", "false").toLowerCase() === "true",
    trustProxy: Number(read("TRUST_PROXY", "0")) || 0,
    adminUsername: read("ADMIN_USERNAME"),
    adminPassword: read("ADMIN_PASSWORD"),
    sessionDays: Number(read("SESSION_DAYS", "30")) || 30,
    youtubeClientId: read("YOUTUBE_CLIENT_ID"),
    youtubeClientSecret: read("YOUTUBE_CLIENT_SECRET"),
    youtubeRedirectUri: read("YOUTUBE_REDIRECT_URI", `${process.env.PUBLIC_URL ?? ""}/api/youtube/callback`),
    youtubeApiKey: read("YOUTUBE_API_KEY"),
    secretKey: read("SECRET_KEY"),
    pexelsApiKey: read("PEXELS_API_KEY"),
    musicDir: read("MUSIC_DIR", "assets/music"),
    sfxDir: read("SFX_DIR", "assets/sfx"),
  };
}
