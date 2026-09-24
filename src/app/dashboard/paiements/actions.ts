"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { paiements, biens, projets, syndics, clients } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { validerPaiement } from "@/lib/paiements";
import { tenterStockage } from "@/lib/stockage-erreurs";
import { lireNombre, verifierMontant } from "@/lib/validation";
import { notifyClient, notifyRole } from "@/lib/notifications";

export type CompleterState = { error?: string } | undefined;

/** Section 12.2 / 9.3 — le Comptable Interne valide le paiement de syndic déclaré par le client ; le SAV est informé. */
export async function validerSyndic(syndicId: string): Promise<{ error?: string } | undefined> {
  const session = await requireRole(["COMPTABLE_INTERNE"]);
  const syndic = await db.query.syndics.findFirst({ where: eq(syndics.id, syndicId) });
  if (!syndic) return { error: "Syndic introuvable." };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, syndic.clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Accès refusé." };
  if (syndic.statut !== "EN_ATTENTE_VALIDATION") return { error: "Ce paiement n'est pas en attente de validation." };

  await db
    .update(syndics)
    .set({ statut: "PAYE", valideParId: session.userId, validatedAt: new Date() })
    .where(eq(syndics.id, syndicId));

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, syndic.bienId) });
  const libelle = `${client.prenom} ${client.nom} · ${bien?.designation ?? ""}`;
  await notifyRole(session.promoteurId!, "SERVICE_APRES_VENTE", {
    type: "SYNDIC_PAYE",
    titre: "Syndic réglé",
    message: `${libelle} : le paiement du syndic (${Math.round(syndic.montant).toLocaleString("fr-FR")} MAD) a été validé par le Comptable Interne.`,
    lien: "/dashboard/sav",
  });
  await notifyClient({
    clientId: client.id,
    type: "SYNDIC_VALIDE",
    titre: "Paiement du syndic validé",
    message: `Votre paiement de syndic pour ${bien?.designation ?? "votre bien"} a été validé. Vous êtes à jour.`,
    lien: `/client/biens/${syndic.bienId}`,
  });

  revalidatePath("/dashboard/paiements");
  revalidatePath("/dashboard/sav");
  revalidatePath(`/client/biens/${syndic.bienId}`);
  return undefined;
}

/**
 * Le Comptable Interne complète la référence de l'opération, le montant exact
 * reçu, la date de réception et le porteur, puis valide le paiement
 * (section 9.1 / 9.2). Un reçu PDF est généré et le client notifié.
 */
export async function completerReference(
  paiementId: string,
  _prev: CompleterState,
  formData: FormData,
): Promise<CompleterState> {
  const session = await requireRole(["COMPTABLE_INTERNE"]);

  const paiement = await db.query.paiements.findFirst({ where: eq(paiements.id, paiementId) });
  if (!paiement) return { error: "Paiement introuvable." };
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, paiement.bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!projet || projet.promoteurId !== session.promoteurId) return { error: "Accès refusé." };

  const reference = String(formData.get("reference") ?? "").trim();
  const montantExact = lireNombre(formData.get("montantExact"));
  const dateReceptionStr = String(formData.get("dateReception") ?? "");
  const porteur = String(formData.get("porteur") ?? "").trim();

  if (!reference) return { error: "Merci d'indiquer la référence de l'opération." };
  const erreurMontant = verifierMontant(montantExact, { libelle: "Le montant exact reçu" });
  if (erreurMontant) return { error: erreurMontant };
  if (!dateReceptionStr) return { error: "Merci d'indiquer la date de réception effective." };
  if (!porteur) return { error: "Merci d'indiquer le porteur de l'opération." };

  const validation = await tenterStockage("validation d'un paiement (reçu)", () =>
    validerPaiement(paiementId, {
      reference,
      montantExact,
      dateReception: new Date(dateReceptionStr),
      porteur,
      valideParId: session.userId,
    }),
  );
  if (!validation.ok) return { error: validation.error };
  if (validation.valeur.error) return { error: validation.valeur.error };

  revalidatePath("/dashboard/paiements");
  revalidatePath("/dashboard/recouvrement");
  revalidatePath("/dashboard/finance");
  revalidatePath(`/dashboard/biens/${paiement.bienId}`);
  revalidatePath(`/client/biens/${paiement.bienId}`);
  return { error: undefined };
}
