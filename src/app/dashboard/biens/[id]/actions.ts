"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { biens, projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { parsePublicPath } from "@/lib/storage";
import { creerPaiement, lirePaiementForm, notifierComptable } from "@/lib/paiements";
import type { PaiementFormState } from "@/components/paiements/PaiementForm";

export async function blockBien(_prev: { error?: string } | undefined, formData: FormData) {
  await requireRole(["PDG"]);
  const bienId = String(formData.get("bienId") ?? "");
  const commentaire = String(formData.get("commentaire") ?? "").trim();

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien) return { error: "Bien introuvable." };
  if (bien.statut !== "DISPONIBLE") {
    return { error: "Seul un bien disponible peut être bloqué." };
  }

  await db.update(biens).set({ statut: "BLOQUE_PDG", pdgCommentaire: commentaire || null }).where(eq(biens.id, bienId));
  revalidatePath(`/dashboard/biens/${bienId}`);
  return { error: undefined };
}

/** Le Directeur Commercial importe (ou remplace) le plan du bien — PDF ou image. */
export async function setPlanBien(_prev: { error?: string } | undefined, formData: FormData) {
  await requireRole(["DIRECTEUR_COMMERCIAL"]);
  const bienId = String(formData.get("bienId") ?? "");
  const planUrl = String(formData.get("planUrl") ?? "");
  if (!bienId || !parsePublicPath(planUrl)) return { error: "Merci d'importer un fichier PDF ou image." };

  await db.update(biens).set({ planUrl }).where(eq(biens.id, bienId));
  revalidatePath(`/dashboard/biens/${bienId}`);
  return { error: undefined };
}

/**
 * Le commercial en charge du bien saisit l'encaissement d'une tranche
 * (section 6.8) : la ligne est créée "En attente comptable" et le Comptable
 * Interne est notifié.
 */
export async function saisirPaiementCommercial(
  _prev: PaiementFormState,
  formData: FormData,
): Promise<PaiementFormState> {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);
  const lu = lirePaiementForm(formData);
  if ("error" in lu) return { error: lu.error };
  if (!lu.data.preuveUrl) return { error: "Merci de joindre la preuve de paiement." };

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, lu.data.bienId) });
  if (!bien) return { error: "Bien introuvable." };
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet || projet.promoteurId !== session.promoteurId) return { error: "Accès refusé." };
  if (bien.commercialId !== session.userId && session.role !== "RESPONSABLE_COMMERCIAL") {
    return { error: "Seul le commercial en charge de ce bien peut saisir un paiement." };
  }

  const res = await creerPaiement(lu.data, { userId: session.userId });
  if ("error" in res) return { error: res.error };

  await notifierComptable(session.promoteurId!, bien, `${session.prenom} ${session.nom}`);

  revalidatePath(`/dashboard/biens/${bien.id}`);
  revalidatePath("/dashboard/paiements");
  return { success: "Paiement enregistré : il est transmis au Comptable Interne pour référencement et validation." };
}

export async function unblockBien(bienId: string) {
  await requireRole(["PDG"]);
  await db.update(biens).set({ statut: "DISPONIBLE", pdgCommentaire: null }).where(eq(biens.id, bienId));
  revalidatePath(`/dashboard/biens/${bienId}`);
}
