"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";
import { ROLES_RECRUTABLES_PAR, ROLES_RECRUTEURS, ROLE_LABELS } from "@/lib/roles";
import { enregistrerActivite, decrireChangements } from "@/lib/journal";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

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

  const [cree] = await db
    .insert(users)
    .values({
      promoteurId: session.promoteurId!,
      role,
      nom,
      prenom,
      email: email || null,
      identifiant,
      passwordHash: await hashPassword(password),
    })
    .returning();
  await enregistrerActivite({
    acteur: session,
    action: "CREATION",
    cibleType: "user",
    cibleId: cree.id,
    cibleNom: `${prenom} ${nom}`,
    details: `Rôle : ${ROLE_LABELS[role]} · identifiant ${identifiant}`,
  });

  revalidatePath("/dashboard/equipe");
  revalidatePath("/dashboard/journal");
  return { success: { identifiant, password, role } };
}

export type ModifRecrueState = { error?: string } | undefined;

/** Le directeur du pôle corrige le nom, le prénom ou l'e-mail d'une recrue. */
export async function modifierRecrue(_prev: ModifRecrueState, formData: FormData): Promise<ModifRecrueState> {
  const session = await requireRole(ROLES_RECRUTEURS);
  const recrutables = ROLES_RECRUTABLES_PAR[session.role as Role] ?? [];
  const userId = String(formData.get("userId") ?? "");
  const recrue = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!recrue || recrue.promoteurId !== session.promoteurId || !recrutables.includes(recrue.role)) {
    return { error: "Ce compte n'appartient pas à votre pôle." };
  }
  if (recrue.deletedAt || !recrue.actif) return { error: "Réactivez d'abord ce compte pour le modifier." };

  const apres = {
    nom: String(formData.get("nom") ?? "").trim(),
    prenom: String(formData.get("prenom") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim() || null,
  };
  if (!apres.nom || !apres.prenom) return { error: "Merci de renseigner le nom et le prénom." };
  const details = decrireChangements(recrue, apres, { nom: "Nom", prenom: "Prénom", email: "E-mail" });
  if (!details) return { error: "Aucune modification à enregistrer." };

  await db.update(users).set(apres).where(eq(users.id, userId));
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "user",
    cibleId: userId,
    cibleNom: `${apres.prenom} ${apres.nom}`,
    details: `${ROLE_LABELS[recrue.role]} · ${details}`,
  });

  revalidatePath("/dashboard/equipe");
  revalidatePath("/dashboard/journal");
  redirect("/dashboard/equipe");
}
