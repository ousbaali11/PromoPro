import type { Config } from "drizzle-kit";

// Configuration drizzle-kit pour PostgreSQL (production).
// Usage : npx drizzle-kit push --config drizzle.config.pg.ts
export default {
  schema: "./src/db/schema.pg.ts",
  out: "./drizzle-pg",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/promopro",
  },
} satisfies Config;
