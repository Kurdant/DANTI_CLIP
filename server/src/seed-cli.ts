import { loadServerEnv } from "./lib/env.js";
import { seedAdmin } from "./seed.js";

const env = loadServerEnv();
seedAdmin(env, true)
  .then((result) => console.log("[seed] " + result))
  .catch((e) => {
    console.error("[seed] Erreur", e);
    process.exitCode = 1;
  });
