import { loadServerEnv } from "./lib/env.js";
import { seedAdmin } from "./seed.js";

const env = loadServerEnv();
const result = seedAdmin(env, true);
console.log("[seed] " + result);
