"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { promoteurs, users } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";

export type CreatePromoteurState =
  | { error?: string; success?: { identifiant: string; password: string } }
  | undefined;

export async function createPromoteur(
  _prev: CreatePromoteurState,
  formData: FormData,
): Promise<CreatePromoteurState> {
  await requireRole(["SUPER_ADMIN"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const pdgNom = String(formData.get("pdgNom") ?? "").trim();
  const pdgPrenom = String(formData.get("pdgPrenom") ?? "").trim();

  if (!nom || !pdgNom || !pdgPrenom) {
    return { error: "Merci de renseigner le nom du promoteur et l'identité du PDG." };
  }

  const [promoteur] = await db
    .insert(promoteurs)
    .values({ nom, contactEmail: contactEmail || null, statut: "EN_ATTENTE" })
    .returning();

  const identifiant = generateIdentifiant("PDG");
  const password = generateTempPassword();
  await db.insert(users).values({
    promoteurId: promoteur.id,
    role: "PDG",
    nom: pdgNom,
    prenom: pdgPrenom,
    identifiant,
    passwordHash: await hashPassword(password),
    email: contactEmail || null,
  });

  revalidatePath("/admin");
  return { success: { identifiant, password } };
}

export async function activerAbonnement(promoteurId: string, formule: string, dureeMois: number) {
  await requireRole(["SUPER_ADMIN"]);
  const debut = new Date();
  const fin = new Date(debut);
  fin.setMonth(fin.getMonth() + dureeMois);

  await db
    .update(promoteurs)
    .set({ statut: "ACTIF", abonnementFormule: formule, abonnementDebut: debut, abonnementFin: fin })
    .where(eq(promoteurs.id, promoteurId));

  revalidatePath("/admin");
}

export async function suspendrePromoteur(promoteurId: string) {
  await requireRole(["SUPER_ADMIN"]);
  await db.update(promoteurs).set({ statut: "SUSPENDU" }).where(eq(promoteurs.id, promoteurId));
  revalidatePath("/admin");
}
