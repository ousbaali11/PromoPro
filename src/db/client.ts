/**
 * Point d'entrée unique de la base de données (voir ARCHITECTURE.md, « Base de données »).
 *
 * - `DATABASE_URL` défini et commençant par "postgres" → PostgreSQL via
 *   drizzle-orm/node-postgres (pool `pg`), schéma schema.pg.ts.
 * - sinon → SQLite local via @libsql/client (data/promopro.db), schéma
 *   schema.sqlite.ts. Comportement historique, inchangé.
 *
 * `db` est typé avec le client SQLite (les deux schémas ont les mêmes types de
 * lignes et les API utilisées — query.*, select/insert/update/delete,
 * returning — sont identiques dans les deux dialectes).
 */
import path from "node:path";
import fs from "node:fs";
import { createClient, type Client as LibsqlClient } from "@libsql/client";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schemaSqlite from "./schema.sqlite";
import * as schemaPg from "./schema.pg";
import { DATABASE_URL, usePostgres } from "./schema";

type Db = LibSQLDatabase<typeof schemaSqlite>;

// Un seul client / pool partagé entre les rechargements à chaud en dev.
const g = globalThis as unknown as { promoproLibsql?: LibsqlClient; promoproPgPool?: Pool };
const isDev = process.env.NODE_ENV !== "production";

/** Options TLS de `pg` d'après l'URL (`sslmode=`) ou `PGSSLMODE`. */
function sslOptions(url: string) {
  const mode = (process.env.PGSSLMODE ?? new URL(url).searchParams.get("sslmode") ?? "").toLowerCase();
  if (mode === "disable") return false as const;
  if (mode === "require" || mode === "prefer" || mode === "verify-ca" || mode === "verify-full") {
    return { rejectUnauthorized: mode === "verify-full" };
  }
  // Réseau privé Railway (*.railway.internal) : pas de TLS ; sinon, `pg` décide (pas de TLS par défaut).
  return undefined;
}

function creerDb(): { db: Db; close: () => Promise<void>; dialecte: "postgres" | "sqlite" } {
  if (usePostgres && DATABASE_URL) {
    let pool = g.promoproPgPool;
    if (!pool) {
      pool = new Pool({
        connectionString: DATABASE_URL,
        max: 10,
        ssl: sslOptions(DATABASE_URL),
        connectionTimeoutMillis: 15_000,
        // Les proxys (Railway) coupent les connexions inactives : on les recycle
        // avant, et on journalise les erreurs des clients inactifs au lieu de
        // laisser l'événement 'error' faire tomber le processus.
        idleTimeoutMillis: 30_000,
      });
      pool.on("error", (err) => console.error("[db] connexion PostgreSQL inactive en erreur :", err.message));
    }
    if (isDev) g.promoproPgPool = pool;
    const db = drizzlePg(pool, { schema: schemaPg }) as unknown as Db;
    return { db, close: () => pool.end(), dialecte: "postgres" };
  }

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const client = g.promoproLibsql ?? createClient({ url: `file:${path.join(dataDir, "promopro.db")}` });
  if (isDev) g.promoproLibsql = client;
  const db = drizzleLibsql(client, { schema: schemaSqlite });
  return {
    db,
    close: async () => {
      client.close();
    },
    dialecte: "sqlite",
  };
}

const instance = creerDb();

export const db = instance.db;
export const dialecte = instance.dialecte;
export const closeDb = instance.close;
