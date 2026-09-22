import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, clients, contrats, echeances, paiements, projets, promoteurs, propositions, users } from "@/db/schema";
import { parsePublicPath } from "@/lib/storage";
import { genererEtStockerRecu } from "@/lib/pdf/recu";
import { genererEtStockerContrat } from "@/lib/pdf/contrat";
import { notifyClient, notifyRole } from "@/lib/notifications";

/**
 * Logique métier partagée des paiements (sections 6.8, 9, 11.8, 11.9, 13.3).
 * Utilisée par les Server Actions du commercial, du client, du comptable et
 * du recouvrement — chaque action vérifie son rôle, puis délègue ici.
 */

export const NATURES_OPERATION = [
  { value: "virement local", label: "Virement local" },
  { value: "virement international", label: "Virement international" },
  { value: "versement", label: "Versement" },
  { value: "cheque", label: "Chèque" },
] as const;

export const DEVISES = ["MAD", "EUR", "USD"] as const;

export type PaiementInput = {
  bienId: string;
  echeanceId: string | null;
  natureOperation: string;
  banque: string;
  dateOperation: Date;
  dateEncaissementCheque: Date | null;
  montant: number;
  devise: string;
  porteur: string;
  preuveUrl: string | null;
  porteurPieceUrl: string | null;
};

function parseDate(value: FormDataEntryValue | null) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Lit et valide les champs communs du formulaire de paiement. */
export function lirePaiementForm(formData: FormData): { data: PaiementInput } | { error: string } {
  const bienId = String(formData.get("bienId") ?? "");
  const echeanceId = String(formData.get("echeanceId") ?? "") || null;
  const natureOperation = String(formData.get("natureOperation") ?? "");
  const banque = String(formData.get("banque") ?? "").trim();
  const dateOperation = parseDate(formData.get("dateOperation"));
  const dateEncaissementCheque = parseDate(formData.get("dateEncaissementCheque"));
  const montant = Number(formData.get("montant"));
  const devise = String(formData.get("devise") ?? "MAD");
  const porteur = String(formData.get("porteur") ?? "").trim();
  const preuveUrl = String(formData.get("preuveUrl") ?? "") || null;
  const porteurPieceUrl = String(formData.get("porteurPieceUrl") ?? "") || null;

  if (!bienId) return { error: "Bien introuvable." };
  if (!NATURES_OPERATION.some((n) => n.value === natureOperation)) return { error: "Nature d'opération invalide." };
  if (!banque) return { error: "Merci d'indiquer la banque." };
  if (!dateOperation) return { error: "Merci d'indiquer la date de l'opération." };
  if (natureOperation === "cheque" && !dateEncaissementCheque) {
    return { error: "Pour un chèque, merci d'indiquer la date d'encaissement prévue." };
  }
  if (!montant || montant <= 0) return { error: "Merci d'indiquer un montant valide." };
  if (!(DEVISES as readonly string[]).includes(devise)) return { error: "Devise invalide." };
  if (!porteur) return { error: "Merci d'indiquer le porteur de l'opération." };
  if (preuveUrl && !parsePublicPath(preuveUrl)) return { error: "La preuve de paiement importée est invalide." };
  if (porteurPieceUrl && !parsePublicPath(porteurPieceUrl)) return { error: "La pièce du porteur importée est invalide." };

  return {
    data: {
      bienId,
      echeanceId,
      natureOperation,
      banque,
      dateOperation,
      dateEncaissementCheque: natureOperation === "cheque" ? dateEncaissementCheque : null,
      montant,
      devise,
      porteur,
      preuveUrl,
      porteurPieceUrl,
    },
  };
}

/** Échéancier d'un bien = celui de sa proposition acceptée la plus récente. */
export async function echeancierDuBien(bienId: string) {
  const proposition = await db.query.propositions.findFirst({
    where: and(eq(propositions.bienId, bienId), eq(propositions.statut, "ACCEPTEE")),
    orderBy: [desc(propositions.createdAt)],
  });
  if (!proposition) return [];
  return db.query.echeances.findMany({
    where: eq(echeances.propositionId, proposition.id),
    orderBy: [asc(echeances.numero)],
  });
}

/**
 * Crée la ligne de paiement. `statut` vaut "EN_ATTENTE_COMPTABLE" (saisie
 * commercial / client) ou "VALIDE" (recouvrement, qui constate un paiement).
 * Retourne le paiement créé. Le contrôle du rôle est fait par l'appelant.
 */
export async function creerPaiement(
  input: PaiementInput,
  auteur: { userId?: string; clientId?: string },
): Promise<{ paiement: typeof paiements.$inferSelect; bien: typeof biens.$inferSelect } | { error: string }> {
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, input.bienId) });
  if (!bien || !bien.clientId) return { error: "Ce bien n'a pas de client associé." };
  if (!["VENDU", "LIVRE"].includes(bien.statut)) return { error: "Un paiement ne peut être saisi que sur un bien vendu." };

  let trancheNumero: number | null = null;
  if (input.echeanceId) {
    const e = await db.query.echeances.findFirst({ where: eq(echeances.id, input.echeanceId) });
    if (!e || e.bienId !== bien.id) return { error: "Tranche invalide." };
    trancheNumero = e.numero;
  } else {
    // Par défaut : première tranche non soldée
    const next = (await echeancierDuBien(bien.id)).find((e) => e.statut !== "PAYEE");
    if (next) {
      input.echeanceId = next.id;
      trancheNumero = next.numero;
    }
  }

  const [paiement] = await db
    .insert(paiements)
    .values({
      bienId: bien.id,
      clientId: bien.clientId,
      echeanceId: input.echeanceId,
      trancheNumero,
      montant: input.montant,
      devise: input.devise,
      natureOperation: input.natureOperation,
      banque: input.banque,
      dateOperation: input.dateOperation,
      dateEncaissementCheque: input.dateEncaissementCheque,
      porteur: input.porteur,
      porteurPieceUrl: input.porteurPieceUrl,
      preuveUrl: input.preuveUrl,
      statut: "EN_ATTENTE_COMPTABLE",
      saisiParId: auteur.userId ?? null,
      saisiParClientId: auteur.clientId ?? null,
    })
    .returning();

  return { paiement, bien };
}

/** Notifie le Comptable Interne qu'une opération attend sa référence / validation. */
export async function notifierComptable(promoteurId: string, bien: typeof biens.$inferSelect, auteurLabel: string) {
  await notifyRole(promoteurId, "COMPTABLE_INTERNE", {
    type: "PAIEMENT_A_VALIDER",
    titre: "Nouveau paiement à valider",
    message: `${auteurLabel} a saisi un paiement pour ${bien.designation} (référence à compléter).`,
    lien: "/dashboard/paiements",
  });
}

/**
 * Impute un montant validé sur l'échéancier du bien (section 11.9) :
 * - on commence par la tranche visée (ou la première non soldée),
 * - la tranche passe à PARTIELLE ou PAYEE selon le cumul,
 * - tout excédent (trop-perçu) est reporté automatiquement sur la ou les
 *   tranches suivantes, réduisant d'autant leur restant dû,
 * - s'il reste un excédent après la dernière tranche, il est enregistré sur
 *   la dernière tranche (montantPaye > montant), visible dans les espaces.
 */
export async function imputerSurEcheancier(bienId: string, echeanceId: string | null, montant: number) {
  const liste = await echeancierDuBien(bienId);
  if (liste.length === 0) return { imputations: [] as { echeanceId: string; numero: number; montant: number }[] };

  let startIdx = echeanceId ? liste.findIndex((e) => e.id === echeanceId) : -1;
  if (startIdx < 0) startIdx = Math.max(0, liste.findIndex((e) => e.statut !== "PAYEE"));

  let restant = montant;
  const imputations: { echeanceId: string; numero: number; montant: number }[] = [];

  for (let i = startIdx; i < liste.length && restant > 0; i++) {
    const e = liste[i];
    const du = Math.max(0, e.montant - e.montantPaye);
    const isLast = i === liste.length - 1;
    const part = isLast ? restant : Math.min(du, restant);
    if (part <= 0) continue;
    const nouveauPaye = e.montantPaye + part;
    await db
      .update(echeances)
      .set({ montantPaye: nouveauPaye, statut: nouveauPaye >= e.montant ? "PAYEE" : "PARTIELLE" })
      .where(eq(echeances.id, e.id));
    imputations.push({ echeanceId: e.id, numero: e.numero, montant: part });
    restant -= part;
  }
  return { imputations };
}

/**
 * Régénère le PDF du contrat confirmé (PRET / ENVOYE / SIGNE) du bien avec
 * l'échéancier et les paiements validés actuels, pour que les références
 * comptables y figurent (section 9.1). Sans effet si le contrat n'est pas
 * encore confirmé ou a été annulé.
 */
export async function regenererContratSiConfirme(
  bien: typeof biens.$inferSelect,
  client: typeof clients.$inferSelect,
  projet: typeof projets.$inferSelect | null | undefined,
  promoteur: typeof promoteurs.$inferSelect | null | undefined,
) {
  const contrat = await db.query.contrats.findFirst({
    where: eq(contrats.bienId, bien.id),
    orderBy: [desc(contrats.createdAt)],
  });
  if (!contrat || !["PRET", "ENVOYE", "SIGNE"].includes(contrat.statut)) return null;
  const echeancier = await echeancierDuBien(bien.id);
  const paiementsBien = await db.query.paiements.findMany({
    where: and(eq(paiements.bienId, bien.id), eq(paiements.clientId, client.id)),
  });
  const pdfUrl = await genererEtStockerContrat(bien, client, echeancier, {
    projet,
    promoteur,
    paiements: paiementsBien,
    reference: contrat.id.slice(0, 8).toUpperCase(),
  });
  await db.update(contrats).set({ pdfUrl }).where(eq(contrats.id, contrat.id));
  return pdfUrl;
}

/**
 * Validation comptable (section 9.1 / 9.2) : complète les références, passe
 * le paiement à VALIDE, met à jour l'échéancier, génère le reçu PDF et
 * notifie le client.
 */
export async function validerPaiement(
  paiementId: string,
  complement: { reference: string; montantExact: number; dateReception: Date; porteur: string; valideParId: string },
): Promise<{ error?: string; recuPdfUrl?: string }> {
  const paiement = await db.query.paiements.findFirst({ where: eq(paiements.id, paiementId) });
  if (!paiement) return { error: "Paiement introuvable." };
  if (paiement.statut === "VALIDE") return { error: "Ce paiement est déjà validé." };

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, paiement.bienId) });
  const client = await db.query.clients.findFirst({ where: eq(clients.id, paiement.clientId) });
  if (!bien || !client) return { error: "Bien ou client introuvable." };
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  const promoteur = projet
    ? await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, projet.promoteurId) })
    : null;
  const validePar = await db.query.users.findFirst({ where: eq(users.id, complement.valideParId) });

  const [updated] = await db
    .update(paiements)
    .set({
      reference: complement.reference,
      montantExact: complement.montantExact,
      dateReception: complement.dateReception,
      porteur: complement.porteur,
      statut: "VALIDE",
      valideParId: complement.valideParId,
      validatedAt: new Date(),
    })
    .where(eq(paiements.id, paiementId))
    .returning();

  const { imputations } = await imputerSurEcheancier(bien.id, paiement.echeanceId, complement.montantExact);
  const echeance = paiement.echeanceId
    ? await db.query.echeances.findFirst({ where: eq(echeances.id, paiement.echeanceId) })
    : null;

  const recuPdfUrl = await genererEtStockerRecu(updated, bien, client, {
    projet,
    promoteur,
    echeance,
    validePar: validePar ? `${validePar.prenom} ${validePar.nom}` : undefined,
  });
  await db.update(paiements).set({ recuPdfUrl }).where(eq(paiements.id, paiementId));

  // Section 9.1 — les références comptables apparaissent dans le contrat :
  // on régénère le PDF du contrat en cours avec les paiements validés à jour.
  await regenererContratSiConfirme(bien, client, projet, promoteur);

  const report = imputations.length > 1 ? " Un excédent a été reporté sur la tranche suivante." : "";
  await notifyClient({
    clientId: client.id,
    type: "RECU_DISPONIBLE",
    titre: "Reçu de paiement disponible",
    message: `Votre paiement de ${Math.round(complement.montantExact).toLocaleString("fr-FR")} ${paiement.devise} pour ${bien.designation} a été validé.${report}`,
    lien: `/client/biens/${bien.id}`,
  });

  return { recuPdfUrl };
}
