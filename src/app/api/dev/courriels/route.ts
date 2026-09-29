import { NextResponse } from "next/server";
import { courrielsCaptures } from "@/lib/courriel";

export const dynamic = "force-dynamic";

/**
 * GET /api/dev/courriels — e-mails capturés (non envoyés) quand RESEND_API_KEY
 * est absente ou pendant la suite e2e, **hors production seulement** : en
 * production la route n'existe pas (404). Sert aux tests de bout en bout pour
 * lire le lien de réinitialisation, et au développement pour vérifier un
 * message sans compte Resend.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  return NextResponse.json({ courriels: courrielsCaptures() });
}
