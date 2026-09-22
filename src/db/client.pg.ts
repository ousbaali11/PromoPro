// ---------------------------------------------------------------------------
// Client PostgreSQL pour la production — voir README « Migrer vers PostgreSQL ».
// Pour basculer : renommer ce fichier en client.ts (et schema.pg.ts en
// schema.ts), définir DATABASE_URL, puis `npm run db:push -- --config drizzle.config.pg.ts`.
// L'API exportée (db, closeDb) est identique à celle du client SQLite.
// ---------------------------------------------------------------------------
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant (ex. postgres://user:pass@host:5432/promopro).");

// Un seul pool partagé entre les rechargements à chaud en dev.
const globalForDb = globalThis as unknown as { pgPool?: Pool };
const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: url,
    max: 10,
    ssl: process.env.PGSSLMODE === "disable" ? undefined : { rejectUnauthorized: false },
  });
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });

export async function closeDb() {
  await pool.end();
}
