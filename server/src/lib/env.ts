import "dotenv/config";

export interface ServerEnv {
  port: number;
  dataDir: string;
  dbPath: string;
  outputDir: string;
  backgroundsDir: string;
  /** Cookies Secure (HTTPS). A mettre a true en production. */
  cookieSecure: boolean;
  /** Nombre de proxies devant l'app (0 = direct). Definir >=1 derriere nginx/Caddy/Cloudflare. */
  trustProxy: number;
  adminUsername: string;
  adminPassword: string;
  sessionDays: number;
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
    cookieSecure: read("COOKIE_SECURE", "false").toLowerCase() === "true",
    trustProxy: Number(read("TRUST_PROXY", "0")) || 0,
    adminUsername: read("ADMIN_USERNAME"),
    adminPassword: read("ADMIN_PASSWORD"),
    sessionDays: Number(read("SESSION_DAYS", "30")) || 30,
  };
}
