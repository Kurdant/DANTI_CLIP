import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

type ScryptOpts = Parameters<typeof scrypt>[3];
function scryptAsync(password: string | Buffer, salt: string | Buffer, keylen: number, opts: ScryptOpts): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, derived) => (err ? reject(err) : resolve(derived)));
  });
}

// Parametres scrypt (KDF natif memoire-lourd). N=2^15 (32768) >= recos modernes.
// r=8, p=1, keylen=64. maxmem adapte pour eviter l'echec d'allocation.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

// Bornes de defense en profondeur (eviter un hash forge avec N/p gigantesques).
const MAX_N = 131072; // 2^17
const MAX_R = 32;
const MAX_P = 2;

/** Hash un mot de passe avec un sel aleatoire (scrypt asynchrone). */
export async function hashPassword(password: string): Promise<string> {
  if (password.length > 512) throw new Error("Mot de passe trop long");
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/** Verifie un mot de passe contre un hash stocke (comparaison a temps constant). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  // Garde-fous avant d'allouer de la memoire/CPU.
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n > MAX_N || r > MAX_R || p > MAX_P) return false;

  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const derived = (await scryptAsync(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM })) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Clé factice (hash d'un mot de passe inconnu) pour égaliser les temps de reponse. */
const DUMMY_HASH = `scrypt$${N}$${R}$${P}$$${Buffer.alloc(16).toString("base64")}$$${Buffer.alloc(64).toString("base64")}`;

/**
 * Verifie, ou si le compte n'existe pas, exécute quand meme un scrypt factice
 * pour empecher l'enumeration de comptes par timing de reponse.
 */
export async function verifyPasswordOrDummy(password: string, stored: string | null): Promise<boolean> {
  if (stored) return verifyPassword(password, stored);
  await verifyPassword(password, DUMMY_HASH);
  return false;
}
