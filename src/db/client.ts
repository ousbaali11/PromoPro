import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "promopro.db");

// Un seul client partagé entre les rechargements à chaud en dev.
const globalForDb = globalThis as unknown as { libsqlClient?: ReturnType<typeof createClient> };

const client = globalForDb.libsqlClient ?? createClient({ url: `file:${dbPath}` });

if (process.env.NODE_ENV !== "production") {
  globalForDb.libsqlClient = client;
}

export const db = drizzle(client, { schema });
export { client };
