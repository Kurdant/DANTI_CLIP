import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { ServerEnv } from "../lib/env.js";
import { asyncHandler, ApiError, requireAuth, csrfProtect } from "../auth/middleware.js";
import { dbQuery } from "../auth/middleware.js";

/** Taille maximale du PNG mascotte. */
const MAX_PNG_BYTES = 10 * 1024 * 1024; // 10 Mo
/** Signature d'un fichier PNG (8 octets). */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Nom fixe de la mascotte dans le sous-dossier utilisateur. */
const MASCOT_NAME = "mascot.png";

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

function userMascotDir(env: ServerEnv, userId: number): string {
  return path.join(env.userMascotsDir, String(userId));
}

function mascotAbs(env: ServerEnv, userId: number): string {
  // Chemin ABSOLU : res.sendFile exige un chemin absolu (DATA_DIR peut etre relatif).
  return path.resolve(userMascotDir(env, userId), MASCOT_NAME);
}

export function mascotRouter(env: ServerEnv): Router {
  // Multer en memoire : on valide le contenu (magic bytes PNG) avant d'ecrire.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PNG_BYTES },
  });

  const router = Router();

  // Apercu de la mascotte du compte.
  router.get("/mascot", requireAuth, asyncHandler(async (req, res) => {
    const abs = mascotAbs(env, req.auth!.userId);
    if (!fs.existsSync(abs)) throw new ApiError(404, "No mascot");
    res.sendFile(abs);
  }));

  // Uploader / remplacer la mascotte du compte (PNG uniquement, verifie par le contenu).
  router.post("/mascot", requireAuth, csrfProtect, (req, res, next) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "File too large (max 10 MB)"));
        }
        return next(new ApiError(400, err instanceof Error ? err.message : "Invalid upload"));
      }
      if (!req.file) return next(new ApiError(400, "No file sent"));
      if (!isPng(req.file.buffer)) return next(new ApiError(400, "Only PNG format is accepted"));

      const dir = userMascotDir(env, req.auth!.userId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(mascotAbs(env, req.auth!.userId), req.file.buffer);
      dbQuery(env, "UPDATE users SET mascot_file = ? WHERE id = ?", [MASCOT_NAME, req.auth!.userId]).run();
      res.status(201).json({ ok: true, mascotFile: MASCOT_NAME });
    });
  });

  // Retirer la mascotte.
  router.delete("/mascot", requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    try {
      fs.rmSync(mascotAbs(env, req.auth!.userId), { force: true });
    } catch {
      /* fichier deja absent */
    }
    dbQuery(env, "UPDATE users SET mascot_file = NULL WHERE id = ?", [req.auth!.userId]).run();
    res.json({ ok: true });
  }));

  return router;
}
