import type { ServerEnv } from "./env.js";

// Augmentation d'Express pour typer req.auth.
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: number; csrfToken: string };
      env?: ServerEnv;
    }
  }
}

export {};
