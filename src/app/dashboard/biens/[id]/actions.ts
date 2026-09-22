"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { biens } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { parsePublicPath } from "@/lib/storage";

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

export async function unblockBien(bienId: string) {
  await requireRole(["PDG"]);
  await db.update(biens).set({ statut: "DISPONIBLE", pdgCommentaire: null }).where(eq(biens.id, bienId));
  revalidatePath(`/dashboard/biens/${bienId}`);
}
