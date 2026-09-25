"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { biens, clients, echeances, paiements, projets, propositions } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { enregistrerActivite } from "@/lib/journal";
import { notifyClient } from "@/lib/notifications";
import { tenterStockage } from "@/lib/stockage-erreurs";
import { regenererContratSiConfirme } from "@/lib/paiements";
import { decrireEcheancier, lireTranchesFormulaire, verifierModificationEcheancier, type ModificationEcheancier } from "@/lib/echeancier";
import { avecVerrou, delaiDeTest } from "@/lib/verrou";

export type EtatEcheancier = { error?: string; success?: string } | undefined;

/**
 * Le commercial du bien (ou le Responsable Commercial) modifie l'échéancier
 * d'une vente conclue depuis la fiche client : tranches EN_ATTENTE retirées,
 * redécoupées ou ajoutées, tranches payées protégées, total 100 % du prix.
 * Journalisé avec le détail avant / après ; le contrat confirmé est régénéré
 * (version archivée) et le client prévenu.
 */
export async function modifierEcheancier(bienId: string, _prev: EtatEcheancier, formData: FormData): Promise<EtatEcheancier> {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== session.promoteurId) return { error: "Bien introuvable." };
  if (!bien.clientId || !["VENDU", "LIVRE"].includes(bien.statut)) return { error: "L'échéancier ne se modifie que sur une vente conclue." };
  if (session.role === "COMMERCIAL" && bien.commercialId !== session.userId) return { error: "Seul le commercial en charge de ce bien peut modifier son échéancier." };

  const proposition = await db.query.propositions.findFirst({
    where: and(eq(propositions.bienId, bien.id), eq(propositions.clientId, bien.clientId), eq(propositions.statut, "ACCEPTEE")),
    orderBy: [desc(propositions.createdAt)],
  });
  if (!proposition) return { error: "Aucune vente acceptée pour ce bien." };
  const saisies = lireTranchesFormulaire(
    formData.getAll("tranchePourcentage").map(String),
    formData.getAll("trancheDate").map(String),
    formData.getAll("trancheId").map(String),
  );
  await delaiDeTest(formData);

  // Concurrence : un paiement validé au même instant fait passer une tranche à PARTIELLE / PAYEE.
  // Les tranches sont relues et vérifiées sous le verrou de l'échéancier (partagé avec la validation
  // des paiements), et chaque suppression exige encore le statut EN_ATTENTE au moment d'écrire.
  const ecriture = await avecVerrou(`echeancier:${bien.id}`, async (): Promise<{ error: string } | { avant: string; resultat: ModificationEcheancier }> => {
    const existantes = await db.query.echeances.findMany({ where: eq(echeances.propositionId, proposition.id), orderBy: [asc(echeances.numero)] });
    const ids = existantes.map((e) => e.id);
    const enAttente = ids.length
      ? await db.query.paiements.findMany({ where: and(inArray(paiements.echeanceId, ids), eq(paiements.statut, "EN_ATTENTE_COMPTABLE")) })
      : [];
    const resultat = verifierModificationEcheancier(existantes, saisies, bien.prix, new Date(), new Set(enAttente.map((p) => p.echeanceId!)));
    if ("error" in resultat) return { error: resultat.error };
    const avant = decrireEcheancier(existantes);
    for (const id of resultat.supprimees) {
      const [supprimee] = await db.delete(echeances).where(and(eq(echeances.id, id), eq(echeances.statut, "EN_ATTENTE"))).returning({ id: echeances.id });
      if (!supprimee) return { error: "Une tranche vient de recevoir un paiement : rechargez l'échéancier avant de le modifier." };
    }
    for (const t of resultat.tranches) {
      if (t.id) {
        await db.update(echeances).set({ numero: t.numero, pourcentage: t.pourcentage, montant: t.montant, dateEcheance: t.dateEcheance }).where(eq(echeances.id, t.id));
        // Les paiements portent le numéro de tranche : ils suivent la renumérotation
        await db.update(paiements).set({ trancheNumero: t.numero }).where(eq(paiements.echeanceId, t.id));
      } else {
        await db.insert(echeances).values({ propositionId: proposition.id, bienId: bien.id, numero: t.numero, pourcentage: t.pourcentage, montant: t.montant, dateEcheance: t.dateEcheance });
      }
    }
    return { avant, resultat };
  });
  if ("error" in ecriture) return { error: ecriture.error };
  const { avant, resultat } = ecriture;
  const apres = decrireEcheancier(resultat.tranches);

  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "echeancier",
    cibleId: proposition.id,
    cibleNom: `Échéancier ${bien.designation}`,
    details: `Avant : ${avant} → Après : ${apres}`,
  });

  const client = await db.query.clients.findFirst({ where: eq(clients.id, bien.clientId) });
  let avertissement = "";
  if (client) {
    const regen = await tenterStockage("contrat (échéancier modifié)", () => regenererContratSiConfirme(bien, client));
    if (!regen.ok) avertissement = ` Le contrat n'a pas pu être régénéré (${regen.error})`;
    await notifyClient({
      clientId: client.id,
      type: "ECHEANCIER_MODIFIE",
      titre: "Échéancier mis à jour",
      message: `L'échéancier de ${bien.designation} a été mis à jour par votre commercial : ${resultat.tranches.length} tranche(s).`,
      lien: `/client/biens/${bien.id}`,
    });
  }

  revalidatePath("/dashboard/clients/[id]", "page");
  revalidatePath(`/dashboard/biens/${bien.id}`);
  revalidatePath("/dashboard/recouvrement");
  revalidatePath("/dashboard/finance");
  revalidatePath(`/client/biens/${bien.id}`);
  return { success: `Échéancier enregistré : ${resultat.tranches.length} tranche(s), total 100 %.${avertissement}` };
}
