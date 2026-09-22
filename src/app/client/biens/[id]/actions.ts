"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { biens } from "@/db/schema";
import { requireClientSession } from "@/lib/session";
import { creerPaiement, lirePaiementForm, notifierComptable } from "@/lib/paiements";
import type { PaiementFormState } from "@/components/paiements/PaiementForm";

/**
 * Section 11.8 / 11.9 — le client déclare lui-même un règlement (tranche
 * suivante, versement complémentaire d'une tranche fractionnée...). La ligne
 * part "En attente comptable" et le Comptable Interne est notifié.
 */
export async function ajouterPaiementClient(_prev: PaiementFormState, formData: FormData): Promise<PaiementFormState> {
  const session = await requireClientSession();
  const lu = lirePaiementForm(formData);
  if ("error" in lu) return { error: lu.error };
  if (!lu.data.preuveUrl) return { error: "Merci de joindre la preuve de paiement." };

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, lu.data.bienId) });
  if (!bien || bien.clientId !== session.clientId) return { error: "Bien introuvable." };

  const res = await creerPaiement(lu.data, { clientId: session.clientId });
  if ("error" in res) return { error: res.error };

  await notifierComptable(session.promoteurId, bien, `Le client ${session.prenom} ${session.nom}`);

  revalidatePath(`/client/biens/${bien.id}`);
  revalidatePath("/dashboard/paiements");
  return { success: "Paiement déclaré. Il sera vérifié par le service comptable ; votre reçu apparaîtra ici une fois validé." };
}
