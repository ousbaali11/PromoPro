import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { restaurerCompte, type TypeCompte } from "@/lib/comptes-service";

/**
 * Annulation d'une suspension ou d'une suppression depuis le bouton « Annuler »
 * du toast. Une route (et non une Server Action) parce que le toast survit aux
 * navigations : une Server Action n'est résolue que sur la page qui l'importe,
 * alors que cette route répond depuis n'importe quelle page.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.kind !== "staff") return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const corps = (await req.json().catch(() => null)) as { type?: string; id?: string } | null;
  const type = corps?.type;
  const id = corps?.id;
  if ((type !== "client" && type !== "user") || !id || typeof id !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const res = await restaurerCompte(session, type as TypeCompte, id);
  return NextResponse.json(res, { status: "error" in res ? 400 : 200 });
}
