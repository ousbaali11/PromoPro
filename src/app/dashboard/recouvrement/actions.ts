"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { biens, projets, clients } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { creerPaiement, lirePaiementForm, validerPaiement } from "@/lib/paiements";
import { tenterStockage } from "@/lib/stockage-erreurs";
import type { PaiementFormState } from "@/components/paiements/PaiementForm";

/**
 * Section 13.3 — le service Recouvrement constate un paiement effectué par le
 * client mais non déclaré : la ligne est créée puis validée immédiatement
 * (pas d'étape comptable), avec reçu PDF et notification du client. Elle est
 * visible aussitôt dans l'espace client.
 */
export async function ajouterPaiementRecouvrement(
  _prev: PaiementFormState,
  formData: FormData,
): Promise<PaiementFormState> {
  const session = await requireRole(["RECOUVREMENT"]);
  const lu = lirePaiementForm(formData);
  if ("error" in lu) return { error: lu.error };
  const reference = String(formData.get("reference") ?? "").trim();
  if (!reference) return { error: "Merci d'indiquer la référence de l'opération constatée." };

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, lu.data.bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== session.promoteurId) return { error: "Bien introuvable." };

  const res = await creerPaiement(lu.data, { userId: session.userId });
  if ("error" in res) return { error: res.error };

  const validation = await tenterStockage("paiement constaté (reçu)", () =>
    validerPaiement(res.paiement.id, {
      reference,
      montantExact: lu.data.montant,
      dateReception: lu.data.dateOperation,
      porteur: lu.data.porteur,
      valideParId: session.userId,
    }),
  );
  if (!validation.ok) return { error: validation.error };
  if (validation.valeur.error) return { error: validation.valeur.error };

  const client = bien.clientId ? await db.query.clients.findFirst({ where: eq(clients.id, bien.clientId) }) : null;

  revalidatePath("/dashboard/recouvrement");
  revalidatePath("/dashboard/paiements");
  revalidatePath("/dashboard/finance");
  revalidatePath(`/dashboard/biens/${bien.id}`);
  revalidatePath(`/client/biens/${bien.id}`);
  return {
    success: `Paiement enregistré et validé pour ${client ? `${client.prenom} ${client.nom}` : "le client"} — reçu généré, visible immédiatement dans son espace.`,
  };
}
