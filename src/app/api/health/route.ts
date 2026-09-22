import { NextResponse } from "next/server";

/**
 * GET /api/health — sonde de vie pour la plateforme d'hébergement (Railway).
 * Sans authentification, sans accès à la base : répond 200 dès que le
 * processus Node sert des requêtes.
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
