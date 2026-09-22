"use server";

import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { contrats, biens, clients, projets, promoteurs, propositions, echeances, paiements } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { notify, notifyClient } from "@/lib/notifications";
import { genererEtStockerContrat } from "@/lib/pdf/contrat";
import { parsePublicPath } from "@/lib/storage";

/** Section 7.4 — le Responsable Administratif marque le dossier du bien livré comme transmis au notaire. */
export async function marquerTransmisNotaire(bienId: string): Promise<{ error?: string } | undefined> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== session.promoteurId) return { error: "Bien introuvable." };
  if (bien.statut !== "LIVRE") return { error: "Le bien doit être livré (double confirmation) avant transmission au notaire." };

  await db.update(biens).set({ notaireTransmisAt: new Date() }).where(eq(biens.id, bienId));
  revalidatePath("/dashboard/contrats");
  return undefined;
}

/**
 * Section 7.3 — le Responsable Administratif dépose le scan de la 4e copie
 * signée et cachetée ; elle devient visible dans l'espace du client.
 */
export async function deposerCopieSignee(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const contratId = String(formData.get("contratId") ?? "");
  const copieSigneeUrl = String(formData.get("copieSigneeUrl") ?? "");
  if (!parsePublicPath(copieSigneeUrl)) return { error: "Merci d'importer le scan de la copie signée." };

  const contrat = await db.query.contrats.findFirst({ where: eq(contrats.id, contratId) });
  if (!contrat) return { error: "Contrat introuvable." };
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, contrat.bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== session.promoteurId) return { error: "Accès refusé." };
  if (["EN_ATTENTE", "ANNULE"].includes(contrat.statut)) return { error: "Le contrat doit d'abord être confirmé." };

  await db.update(contrats).set({ copieSigneeUrl, statut: "SIGNE" }).where(eq(contrats.id, contratId));

  if (bien.clientId) {
    await notifyClient({
      clientId: bien.clientId,
      type: "CONTRAT_SIGNE",
      titre: "Copie signée de votre contrat disponible",
      message: `La copie signée et cachetée du contrat de ${bien.designation} est consultable dans vos documents.`,
      lien: `/client/biens/${bien.id}`,
    });
  }

  revalidatePath("/dashboard/contrats");
  revalidatePath(`/client/biens/${bien.id}`);
  return { error: undefined };
}

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
