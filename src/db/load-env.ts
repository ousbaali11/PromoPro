/**
 * Charge `.env.local` puis `.env` dans `process.env` (sans écraser les
 * variables déjà définies), pour les outils lancés hors de Next.js :
 * drizzle-kit (`drizzle.config.ts`) et le seed (`tsx src/db/seed.ts`).
 * Next.js charge lui-même ces fichiers pour `dev`, `build` et `start`.
 */
import fs from "node:fs";
import path from "node:path";

export function loadEnvFiles(cwd = process.cwd()) {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(cwd, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnvFiles();
