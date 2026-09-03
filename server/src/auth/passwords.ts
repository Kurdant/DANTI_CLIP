import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

// Parametres scrypt (KDF memoire-lourd natif). N=16384 (2^14), r=8, p=1, keylen=64.
// Format stocke : scrypt$N$r$p$salt$hash (base64)
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

/** Hash un mot de passe avec un sel aleatoire (scrypt). */
export function hashPassword(password: string): string {
  // Limite pour eviter les mots de passe abusivement longs (DOS).
  if (password.length > 512) throw new Error("Mot de passe trop long");
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/** Verifie un mot de passe contre un hash stocke (comparaison a temps constant). */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = scryptSync(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
