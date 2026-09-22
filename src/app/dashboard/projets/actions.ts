"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { projets, biens } from "@/db/schema";
import { requireRole } from "@/lib/session";

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

export async function addBien(_prev: { error?: string } | undefined, formData: FormData) {
  await requireRole(["DIRECTEUR_COMMERCIAL"]);

  const projetId = String(formData.get("projetId") ?? "");
  const designation = String(formData.get("designation") ?? "").trim();
  const nature = String(formData.get("nature") ?? "Appartement");
  const prix = Number(formData.get("prix"));
  const surface = Number(formData.get("surface"));

  if (!projetId || !designation || !prix || !surface) {
    return { error: "Merci de compléter tous les champs du bien (désignation, prix, surface)." };
  }

  await db.insert(biens).values({ projetId, designation, nature, prix, surface });

  revalidatePath(`/dashboard/projets/${projetId}`);
  return { error: undefined };
}

export async function deleteBien(bienId: string, projetId: string) {
  await requireRole(["DIRECTEUR_COMMERCIAL"]);
  await db.delete(biens).where(eq(biens.id, bienId));
  revalidatePath(`/dashboard/projets/${projetId}`);
}
