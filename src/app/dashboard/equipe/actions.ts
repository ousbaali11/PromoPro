"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";

export type CreateUserState = { error?: string; success?: { identifiant: string; password: string } } | undefined;

const ALLOWED_ROLES: Role[] = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "RESPONSABLE_ADMINISTRATIF"];

export async function createRecrue(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const email = String(formData.get("email") ?? "").trim();

  if (!nom || !prenom || !ALLOWED_ROLES.includes(role)) {
    return { error: "Merci de renseigner le nom, le prénom et le statut de la recrue." };
  }

  const identifiant = generateIdentifiant(role.slice(0, 2));
  const password = generateTempPassword();

  await db.insert(users).values({
    promoteurId: session.promoteurId!,
    role,
    nom,
    prenom,
    email: email || null,
    identifiant,
    passwordHash: await hashPassword(password),
  });

  revalidatePath("/dashboard/equipe");
  return { success: { identifiant, password } };
}
