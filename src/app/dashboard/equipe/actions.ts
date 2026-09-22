"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";
import { ROLES_RECRUTABLES_PAR, ROLES_RECRUTEURS, ROLE_LABELS } from "@/lib/roles";

export type CreateUserState = { error?: string; success?: { identifiant: string; password: string; role: Role } } | undefined;

/** Préfixe d'identifiant par rôle recruté (lisible, sans ambiguïté). */
const PREFIX: Partial<Record<Role, string>> = {
  COMMERCIAL: "COM",
  RESPONSABLE_COMMERCIAL: "RC",
  RESPONSABLE_ADMINISTRATIF: "RA",
  ASSISTANT_ADMINISTRATIF: "AA",
  SERVICE_APRES_VENTE: "SAV",
  COMPTABLE_INTERNE: "CPT",
  RECOUVREMENT: "REC",
};

/**
 * Un directeur recrute un membre de son pôle (voir ROLES_RECRUTABLES_PAR) :
 * Directeur Commercial → commercial, responsable commercial, responsable
 * administratif, assistant administratif, SAV ; Directeur Financier →
 * comptable interne, recouvrement. Le rôle demandé est validé côté serveur
 * contre le pôle du directeur connecté.
 */
export async function createRecrue(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const session = await requireRole(ROLES_RECRUTEURS);
  const recrutables = ROLES_RECRUTABLES_PAR[session.role as Role] ?? [];

  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const email = String(formData.get("email") ?? "").trim();

  if (!nom || !prenom) return { error: "Merci de renseigner le nom et le prénom de la recrue." };
  if (!recrutables.includes(role)) {
    return {
      error: `Vous ne pouvez créer que les rôles de votre pôle : ${recrutables.map((r) => ROLE_LABELS[r]).join(", ")}.`,
    };
  }

  const identifiant = generateIdentifiant(PREFIX[role] ?? role.slice(0, 3));
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
  return { success: { identifiant, password, role } };
}
