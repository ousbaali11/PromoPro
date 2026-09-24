import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/session/fermer — ferme la session courante (cookie supprimé) et
 * renvoie à la connexion avec un motif affiché. Utilisée quand un compte est
 * suspendu, supprimé ou dont le promoteur est suspendu PENDANT une session :
 * un Server Component ne peut pas modifier les cookies, il redirige ici.
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  const motif = req.nextUrl.searchParams.get("motif") === "compte-inactif" ? "compte-inactif" : "session-fermee";
  return NextResponse.redirect(new URL(`/login?motif=${motif}`, req.nextUrl.origin), { status: 303 });
}
