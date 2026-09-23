import { NextResponse } from "next/server";
import { sql, type SQL } from "drizzle-orm";
import { db, dialecte } from "@/db/client";
import { verifierSante, statutHttp } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — état réel de l'application, pour le healthcheck Railway
 * et une surveillance externe (voir DEPLOY.md « Surveillance »).
 * Sans authentification. Exécute « SELECT 1 » sur la base avec un délai de
 * 2,5 s : 200 { ok: true, database: "ok", timestamp } si elle répond,
 * 503 { ok: false, database: "unreachable" } si elle est en erreur ou muette.
 * Le détail de l'erreur part dans les logs du serveur, jamais dans la réponse.
 */
export async function GET() {
  const etat = await verifierSante(() => sonde());
  return NextResponse.json(etat, { status: statutHttp(etat), headers: { "Cache-Control": "no-store" } });
}

/** Requête minimale selon le dialecte (PostgreSQL : execute ; SQLite/libsql : run). */
function sonde(): Promise<unknown> {
  const requete = sql`select 1`;
  if (dialecte === "postgres") return (db as unknown as { execute: (q: SQL) => Promise<unknown> }).execute(requete);
  return db.run(requete);
}
