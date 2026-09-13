import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

/**
 * Upload en masse de fonds video vers la bibliotheque du compte admin (via l'API).
 *
 * Usage :
 *   npm run upload:bg -- <dossier>
 *
 * Connexion : ADMIN_USERNAME / ADMIN_PASSWORD du .env.
 * Cible : BASE_URL (defaut https://danticlip.kurdant.fr) -> /api/backgrounds/upload.
 * Chaque fichier est verifie/normalise cote serveur (MP4 uniquement).
 */

const BASE_URL = process.env.BASE_URL ?? "https://danticlip.kurdant.fr";
const USER = process.env.ADMIN_USERNAME ?? "";
const PASS = process.env.ADMIN_PASSWORD ?? "";

async function main(): Promise<void> {
  const folderArg = process.argv[2];
  if (!folderArg) {
    console.error("Usage : npm run upload:bg -- <dossier>");
    process.exit(1);
  }
  if (!USER || !PASS) {
    console.error("[upload] ADMIN_USERNAME / ADMIN_PASSWORD manquants dans .env");
    process.exit(1);
  }
  const srcDir = path.resolve(folderArg);
  if (!fs.existsSync(srcDir)) {
    console.error(`[upload] dossier introuvable : ${srcDir}`);
    process.exit(1);
  }

  // 1) Connexion admin -> cookie + jeton CSRF.
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!login.ok) {
    console.error("[upload] echec connexion admin :", login.status, await login.text());
    process.exit(1);
  }
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const me = await fetch(`${BASE_URL}/api/auth/me`, { headers: { Cookie: cookie } });
  const meJson = (await me.json()) as { csrfToken?: string };
  const csrf = meJson.csrfToken ?? "";
  if (!csrf) {
    console.error("[upload] jeton CSRF introuvable");
    process.exit(1);
  }

  const files = fs.readdirSync(srcDir).filter((f) => /\.mp4$/i.test(f));
  if (files.length === 0) {
    console.log("[upload] aucun .mp4 dans", srcDir);
    return;
  }
  console.log(`[upload] ${files.length} fichier(s) vers ${BASE_URL} (compte ${USER})`);

  let ok = 0;
  for (const f of files.sort()) {
    const buf = fs.readFileSync(path.join(srcDir, f));
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: "video/mp4" }), f);
    const res = await fetch(`${BASE_URL}/api/backgrounds/upload`, {
      method: "POST",
      headers: { Cookie: cookie, "X-CSRF-Token": csrf },
      body: fd,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) {
      ok++;
      console.log(`[OK] ${f}`);
    } else {
      console.log(`[SKIP] ${f} — ${body.error ?? "erreur"}`);
    }
  }
  console.log(`[upload] termine : ${ok}/${files.length} importes`);
}

main().catch((e) => {
  console.error("[upload] erreur fatale", e);
  process.exitCode = 1;
});
