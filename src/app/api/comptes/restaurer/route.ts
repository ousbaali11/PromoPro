import { NextResponse } from "next/server";
import { getStaffSessionActive } from "@/lib/session";
import { restaurerCompte, type TypeCompte } from "@/lib/comptes-service";

/**
 * Annulation d'une suspension ou d'une suppression depuis le bouton « Annuler »
 * du toast. Une route (et non une Server Action) parce que le toast survit aux
 * navigations : une Server Action n'est résolue que sur la page qui l'importe,
 * alors que cette route répond depuis n'importe quelle page.
 */
export async function POST(req: Request) {
  // 1) Appelant : session staff dont le compte est lui-même actif (un compte suspendu n'agit plus)
  const session = await getStaffSessionActive();
  if (!session) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const corps = (await req.json().catch(() => null)) as { type?: string; id?: string } | null;
  const type = corps?.type;
  const id = corps?.id;
  if ((type !== "client" && type !== "user") || !id || typeof id !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  // 2) Cible : même règle que la suspension / suppression (cibleInterne / cibleClient dans comptes-service :
  //    même promoteur, pas soi-même, ROLES_GERABLES_PAR ou commercial gérant) — un refus vaut 403
  const res = await restaurerCompte(session, type as TypeCompte, id);
  return NextResponse.json(res, { status: "error" in res ? 403 : 200 });
}
