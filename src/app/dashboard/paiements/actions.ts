"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { paiements, biens, projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { validerPaiement } from "@/lib/paiements";

export type CompleterState = { error?: string } | undefined;

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
  const montantExact = Number(formData.get("montantExact"));
  const dateReceptionStr = String(formData.get("dateReception") ?? "");
  const porteur = String(formData.get("porteur") ?? "").trim();

  if (!reference) return { error: "Merci d'indiquer la référence de l'opération." };
  if (!montantExact || montantExact <= 0) return { error: "Merci d'indiquer le montant exact reçu." };
  if (!dateReceptionStr) return { error: "Merci d'indiquer la date de réception effective." };
  if (!porteur) return { error: "Merci d'indiquer le porteur de l'opération." };

  const res = await validerPaiement(paiementId, {
    reference,
    montantExact,
    dateReception: new Date(dateReceptionStr),
    porteur,
    valideParId: session.userId,
  });
  if (res.error) return { error: res.error };

  revalidatePath("/dashboard/paiements");
  revalidatePath("/dashboard/recouvrement");
  revalidatePath("/dashboard/finance");
  revalidatePath(`/dashboard/biens/${paiement.bienId}`);
  revalidatePath(`/client/biens/${paiement.bienId}`);
  return { error: undefined };
}
