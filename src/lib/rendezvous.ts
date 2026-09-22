import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, clients, projets, rendezvous, users } from "@/db/schema";
import type { Service } from "@/lib/creneaux";

/**
 * Rendez-vous vus côté staff : ceux du service donné, chez le promoteur de la
 * session. Pour le service COMMERCIAL, uniquement les rendez-vous des biens
 * dont l'utilisateur est le commercial (sauf Responsable Commercial : tous).
 */
export async function rendezvousPourService(
  service: Service,
  session: { userId: string; role: string; promoteurId: string | null },
) {
  const clientsPromo = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });
  const clientIds = clientsPromo.map((c) => c.id);
  if (clientIds.length === 0) return [];
  const clientById = new Map(clientsPromo.map((c) => [c.id, c]));

  let rows = await db.query.rendezvous.findMany({
    where: and(eq(rendezvous.service, service), inArray(rendezvous.clientId, clientIds)),
    orderBy: [desc(rendezvous.dateProposee)],
  });

  const allBiens = await db.query.biens.findMany();
  const bienById = new Map(allBiens.map((b) => [b.id, b]));
  const projetById = new Map(
    (await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) })).map((p) => [p.id, p]),
  );

  if (service === "COMMERCIAL" && session.role === "COMMERCIAL") {
    rows = rows.filter((r) => {
      const bien = r.bienId ? bienById.get(r.bienId) : null;
      const client = clientById.get(r.clientId);
      return bien ? bien.commercialId === session.userId : client?.commercialId === session.userId;
    });
  }

  const staff = await db.query.users.findMany({ where: eq(users.promoteurId, session.promoteurId!) });
  const userById = new Map(staff.map((u) => [u.id, u]));

  return rows.map((r) => ({
    rdv: r,
    client: clientById.get(r.clientId) ?? null,
    bien: r.bienId ? bienById.get(r.bienId) ?? null : null,
    projet: r.bienId && bienById.get(r.bienId) ? projetById.get(bienById.get(r.bienId)!.projetId) ?? null : null,
    traitePar: r.traiteParId ? userById.get(r.traiteParId) ?? null : null,
  }));
}

export type RdvRow = Awaited<ReturnType<typeof rendezvousPourService>>[number];
