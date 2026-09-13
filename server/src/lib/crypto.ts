import crypto from "node:crypto";

/**
 * Chiffrement symetrique AES-256-GCM pour les secrets d'utilisateurs (BYOK).
 * Un hash ne suffit pas : le secret doit rester utilisable pour OAuth,
 * donc on chiffre avec une cle serveur (SECRET_KEY) et on verifie l'integrite.
 */

const ALGO = "aes-256-gcm";

function keyFrom(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptString(plain: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptString(payload: string, secret: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(ALGO, keyFrom(secret), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
