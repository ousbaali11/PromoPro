import type { Config } from "drizzle-kit";
import "./src/db/load-env";
import { afficherBandeau, cheminSqlite } from "./src/db/guard";

// Bandeau vert/rouge dès le lancement de drizzle-kit (db:push, db:studio…)
afficherBandeau();

// Même règle que src/db/client.ts : DATABASE_URL "postgres…" → PostgreSQL,
// sinon SQLite local. `npm run db:push` cible donc toujours la base que
// l'application utilise.
const url = process.env.DATABASE_URL?.trim();
const usePostgres = !!url && /^postgres(ql)?:\/\//i.test(url);

export default (usePostgres
  ? {
      schema: "./src/db/schema.pg.ts",
      out: "./drizzle-pg",
      dialect: "postgresql",
      dbCredentials: { url: url! },
    }
  : {
      schema: "./src/db/schema.sqlite.ts",
      out: "./drizzle",
      dialect: "turso",
      dbCredentials: { url: `file:${cheminSqlite()}` },
    }) satisfies Config;
