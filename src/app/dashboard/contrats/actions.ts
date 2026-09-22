"use server";

import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { contrats, biens, clients, projets, promoteurs, propositions, echeances, paiements } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { notify } from "@/lib/notifications";
import { genererEtStockerContrat } from "@/lib/pdf/contrat";

/**
 * Le Responsable Administratif vérifie et confirme le contrat : le PDF est
 * généré à partir des données du bien, du client et de l'échéancier accepté
 * (section 7.2), puis le commercial est notifié "contrat prêt".
 */
export async function confirmerContrat(contratId: string): Promise<{ error?: string } | undefined> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);

  const contrat = await db.query.contrats.findFirst({ where: eq(contrats.id, contratId) });
  if (!contrat) return { error: "Contrat introuvable." };
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, contrat.bienId) });
  if (!bien?.commercialId || !bien.clientId) return { error: "Le bien n'a pas de client ou de commercial associé." };

  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet || projet.promoteurId !== session.promoteurId) return { error: "Accès refusé." };

  const client = await db.query.clients.findFirst({ where: eq(clients.id, bien.clientId) });
  if (!client) return { error: "Client introuvable." };

  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, projet.promoteurId) });

  // Échéancier de la proposition acceptée (la plus récente pour ce bien)
  const proposition = await db.query.propositions.findFirst({
    where: and(eq(propositions.bienId, bien.id), eq(propositions.statut, "ACCEPTEE")),
    orderBy: [desc(propositions.createdAt)],
  });
  const echeancier = proposition
    ? await db.query.echeances.findMany({ where: eq(echeances.propositionId, proposition.id) })
    : [];
  const paiementsBien = await db.query.paiements.findMany({ where: eq(paiements.bienId, bien.id) });

  const pdfUrl = await genererEtStockerContrat(bien, client, echeancier, {
    projet,
    promoteur,
    paiements: paiementsBien,
    reference: contrat.id.slice(0, 8).toUpperCase(),
  });

  await db
    .update(contrats)
    .set({ statut: "PRET", confirmedAt: new Date(), pdfUrl })
    .where(eq(contrats.id, contratId));

  await notify({
    userId: bien.commercialId,
    type: "CONTRAT_PRET",
    titre: "Contrat prêt",
    message: `Le contrat de ${bien.designation} est prêt : à imprimer sur place ou à envoyer par e-mail.`,
    lien: "/dashboard/contrats",
  });

  revalidatePath("/dashboard/contrats");
  revalidatePath(`/client/biens/${bien.id}`);
  return undefined;
}
