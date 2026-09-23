import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/test-erreur — déclenche une erreur volontaire pour vérifier la
 * remontée à Sentry (route API → onRequestError), **en développement
 * seulement** : en production la route n'existe pas (404).
 *
 * L'erreur embarque de fausses données sensibles (CIN, téléphone, IBAN,
 * e-mail, mot de passe) dans son message et dans une miette (breadcrumb) :
 * dans Sentry, tout doit apparaître sous la forme « [masqué] », y compris
 * dans les lignes de code affichées autour de la pile.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  Sentry.addBreadcrumb({
    category: "test",
    message: "Saisie CIN AB123456 pour client.test@exemple.ma, cookie promopro_session=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.abcdefghijklmnopqrstuvwxyz0123456789",
    data: { password: "secret-123", telephone1: "06 12 34 56 78", iban: "MA64011519000001205000534921" },
  });

  throw new Error(
    "Erreur de test Sentry (volontaire) — CIN AB123456, tél 06 12 34 56 78, IBAN MA64011519000001205000534921, e-mail client.test@exemple.ma, mot de passe secret-123",
  );
}
