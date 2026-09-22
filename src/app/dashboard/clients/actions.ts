"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { requireRole, requireStaffSession } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";

export type CreateClientState = { error?: string; success?: { identifiant: string; password: string } } | undefined;

export async function createClient(_prev: CreateClientState, formData: FormData): Promise<CreateClientState> {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "DIRECTEUR_COMMERCIAL"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const telephone1 = String(formData.get("telephone1") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!nom || !prenom || !telephone1 || !email) {
    return { error: "Nom, prénom, téléphone et e-mail sont obligatoires." };
  }

  const identifiant = generateIdentifiant("CL");
  const password = generateTempPassword();

  await db.insert(clients).values({
    promoteurId: session.promoteurId!,
    nom,
    prenom,
    dateNaissance: String(formData.get("dateNaissance") ?? "") || null,
    lieuNaissance: String(formData.get("lieuNaissance") ?? "") || null,
    adresse: String(formData.get("adresse") ?? "") || null,
    pieceType: String(formData.get("pieceType") ?? "CIN"),
    pieceNumero: String(formData.get("pieceNumero") ?? "") || null,
    telephone1,
    telephone2: String(formData.get("telephone2") ?? "") || null,
    email,
    identifiant,
    passwordHash: await hashPassword(password),
    commercialId: session.userId,
  });

  revalidatePath("/dashboard/clients");
  return { success: { identifiant, password } };
}

/** Le commercial réinitialise le mot de passe d'un de ses clients (identifiant inchangé). */
export async function resetClientPassword(clientId: string): Promise<{ password: string } | { error: string }> {
  const session = await requireStaffSession();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Client introuvable." };

  const password = generateTempPassword();
  await db.update(clients).set({ passwordHash: await hashPassword(password) }).where(eq(clients.id, clientId));
  revalidatePath("/dashboard/clients");
  return { password };
}
