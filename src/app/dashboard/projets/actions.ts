"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { projets, biens, epingles } from "@/db/schema";
import { requireRole, requireStaffSession } from "@/lib/session";

export async function createProjet(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const nomCompte = String(formData.get("nomCompte") ?? "").trim();
  const iban = String(formData.get("iban") ?? "").trim();

  if (!nom || !nomCompte || !iban) {
    return { error: "Merci de renseigner le nom du projet, le nom du compte et l'IBAN." };
  }

  const [projet] = await db
    .insert(projets)
    .values({ promoteurId: session.promoteurId!, nom, nomCompte, iban, createdById: session.userId })
    .returning();

  revalidatePath("/dashboard/projets");
  redirect(`/dashboard/projets/${projet.id}`);
}

async function projetDuPromoteur(projetId: string, promoteurId: string | null) {
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, projetId) });
  return projet && projet.promoteurId === promoteurId ? projet : null;
}

export async function addBien(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);

  const projetId = String(formData.get("projetId") ?? "");
  const designation = String(formData.get("designation") ?? "").trim();
  const nature = String(formData.get("nature") ?? "Appartement");
  const prix = Number(formData.get("prix"));
  const surface = Number(formData.get("surface"));

  if (!projetId || !designation || !prix || !surface) {
    return { error: "Merci de compléter tous les champs du bien (désignation, prix, surface)." };
  }
  if (!(await projetDuPromoteur(projetId, session.promoteurId))) return { error: "Projet introuvable." };

  await db.insert(biens).values({ projetId, designation, nature, prix, surface });

  revalidatePath(`/dashboard/projets/${projetId}`);
  return { error: undefined };
}

/**
 * Épingle / désépingle un bien pour l'utilisateur connecté (accès rapide
 * depuis son tableau de bord). Simple présence d'une ligne `epingles`.
 */
export async function toggleEpingle(bienId: string): Promise<{ epingle: boolean; error?: string }> {
  const session = await requireStaffSession();
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien || !(await projetDuPromoteur(bien.projetId, session.promoteurId))) {
    return { epingle: false, error: "Bien introuvable." };
  }
  const existante = await db.query.epingles.findFirst({
    where: and(eq(epingles.userId, session.userId), eq(epingles.bienId, bienId)),
  });
  if (existante) {
    await db.delete(epingles).where(eq(epingles.id, existante.id));
  } else {
    await db.insert(epingles).values({ userId: session.userId, bienId });
  }
  revalidatePath(`/dashboard/projets/${bien.projetId}`);
  revalidatePath("/dashboard");
  return { epingle: !existante };
}

export async function deleteBien(bienId: string, projetId: string) {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);
  if (!(await projetDuPromoteur(projetId, session.promoteurId))) return;
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  // On ne supprime qu'un bien encore libre de tout engagement
  if (!bien || bien.projetId !== projetId || !["DISPONIBLE", "BLOQUE_PDG"].includes(bien.statut)) return;
  await db.delete(biens).where(eq(biens.id, bienId));
  revalidatePath(`/dashboard/projets/${projetId}`);
}
