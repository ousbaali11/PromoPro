// Régénère src/db/schema.pg.ts (PostgreSQL) à partir de src/db/schema.ts (SQLite).
// Usage : npm run db:pg-schema
// Les deux schémas doivent rester identiques colonne par colonne ; seul le
// dialecte change. Lancez ce script après toute modification de schema.ts.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");

const out = src
  .replace(
    'import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";',
    'import { pgTable, text, integer, doublePrecision, timestamp, boolean } from "drizzle-orm/pg-core";',
  )
  .replace(/sqliteTable\(/g, "pgTable(")
  .replace(/integer\(("[a-z_]+"), \{ mode: "timestamp" \}\)/g, "timestamp($1, { withTimezone: true })")
  .replace(/integer\(("[a-z_]+"), \{ mode: "boolean" \}\)/g, "boolean($1)")
  .replace(/\breal\(/g, "doublePrecision(");

const header = `// ---------------------------------------------------------------------------
// Schéma PostgreSQL — miroir exact de schema.ts (SQLite) pour la production.
// Voir README « Migrer vers PostgreSQL ». Généré par scripts/gen-pg-schema.mjs
// (\`npm run db:pg-schema\`) : ne pas éditer à la main, modifier schema.ts.
// ---------------------------------------------------------------------------
`;

writeFileSync(new URL("../src/db/schema.pg.ts", import.meta.url), header + out);
console.log("src/db/schema.pg.ts régénéré.");
