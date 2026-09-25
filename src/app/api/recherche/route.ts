import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, clients, projets } from "@/db/schema";
import { getStaffSessionActive } from "@/lib/session";
import { rechercher, requeteValide, type ResultatRecherche } from "@/lib/recherche";
import { STATUT_BIEN_LABELS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/recherche?q=… — recherche globale du dashboard.
 * Cloisonnement identique au reste de l'application : projets et biens du
 * promoteur de la session uniquement ; clients du promoteur, et pour un
 * commercial ou responsable commercial, seulement ses propres clients (même
 * règle que la fiche client). Le Super Admin n'a pas de dashboard : 401.
 */
export async function GET(req: NextRequest) {
  const session = await getStaffSessionActive();
  if (!session || !session.promoteurId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  if (!requeteValide(q)) return NextResponse.json({ groupes: [] }, { headers: { "Cache-Control": "no-store" } });

  const promoteurId = session.promoteurId;
  const listeProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, promoteurId) });
  const projetIds = listeProjets.map((p) => p.id);
  const projetNom = new Map(listeProjets.map((p) => [p.id, p.nom]));
  const listeBiens = projetIds.length ? await db.query.biens.findMany({ where: inArray(biens.projetId, projetIds) }) : [];
  // Pôle commercial : le Commercial ne cherche que dans ses clients, le Responsable Commercial dans tout le pôle (règle partagée avec la fiche et la liste)
  const seulementLesMiens = session.role === "COMMERCIAL";
  const listeClients = await db.query.clients.findMany({
    where: seulementLesMiens
      ? and(eq(clients.promoteurId, promoteurId), eq(clients.commercialId, session.userId), isNull(clients.deletedAt))
      : and(eq(clients.promoteurId, promoteurId), isNull(clients.deletedAt)),
  });

  const sources: Record<"bien" | "client" | "projet", ResultatRecherche[]> = {
    bien: listeBiens.map((b) => ({
      type: "bien",
      id: b.id,
      titre: b.designation,
      sousTitre: `${projetNom.get(b.projetId) ?? ""} · ${STATUT_BIEN_LABELS[b.statut] ?? b.statut}`,
      href: `/dashboard/biens/${b.id}`,
    })),
    client: listeClients.map((c) => ({
      type: "client",
      id: c.id,
      titre: `${c.prenom} ${c.nom}`,
      sousTitre: c.identifiant,
      href: `/dashboard/clients/${c.id}`,
    })),
    projet: listeProjets.map((p) => ({ type: "projet", id: p.id, titre: p.nom, sousTitre: p.nomCompte, href: `/dashboard/projets/${p.id}` })),
  };

  return NextResponse.json({ groupes: rechercher(sources, q) }, { headers: { "Cache-Control": "no-store" } });
}
