"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { promoteurs, users, type Role } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";
import { enregistrerActivite } from "@/lib/journal";
import { invaliderTousLesEtats } from "@/lib/etat-compte";

export type Acces = { role: Role; nom: string; prenom: string; identifiant: string; password: string };

export type CreatePromoteurState =
  | {
      error?: string;
      success?: { promoteur: string; acces: { pdg: Acces; directeurCommercial: Acces; directeurFinancier: Acces } };
    }
  | undefined;

/** Les trois directions créées avec le promoteur (section 3.1) et le préfixe de leur identifiant. */
const DIRECTIONS = [
  { cle: "pdg", role: "PDG", prefix: "PDG", champ: "pdg", libelle: "PDG" },
  { cle: "directeurCommercial", role: "DIRECTEUR_COMMERCIAL", prefix: "DC", champ: "dircom", libelle: "Directeur Commercial" },
  { cle: "directeurFinancier", role: "DIRECTEUR_FINANCIER", prefix: "DF", champ: "dirfin", libelle: "Directeur Financier" },
] as const;

/**
 * Le Super Admin crée en un seul geste le promoteur et ses trois directions :
 * PDG, Directeur Commercial et Directeur Financier, chacun avec un identifiant
 * et un mot de passe temporaire générés. Les directeurs recrutent ensuite les
 * rôles de leur pôle depuis /dashboard/equipe (voir ROLES_RECRUTABLES_PAR).
 */
export async function createPromoteur(
  _prev: CreatePromoteurState,
  formData: FormData,
): Promise<CreatePromoteurState> {
  const session = await requireRole(["SUPER_ADMIN"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  if (!nom) return { error: "Merci de renseigner le nom du promoteur." };

  const identites: Record<string, { nom: string; prenom: string }> = {};
  for (const d of DIRECTIONS) {
    const n = String(formData.get(`${d.champ}Nom`) ?? "").trim();
    const p = String(formData.get(`${d.champ}Prenom`) ?? "").trim();
    if (!n || !p) return { error: `Merci de renseigner le nom et le prénom du ${d.libelle}.` };
    identites[d.cle] = { nom: n, prenom: p };
  }

  const [promoteur] = await db
    .insert(promoteurs)
    .values({ nom, contactEmail: contactEmail || null, statut: "EN_ATTENTE" })
    .returning();

  const acces = {} as Record<(typeof DIRECTIONS)[number]["cle"], Acces>;
  for (const d of DIRECTIONS) {
    const identifiant = generateIdentifiant(d.prefix);
    const password = generateTempPassword();
    await db.insert(users).values({
      promoteurId: promoteur.id,
      role: d.role,
      nom: identites[d.cle].nom,
      prenom: identites[d.cle].prenom,
      identifiant,
      passwordHash: await hashPassword(password),
      email: d.role === "PDG" ? contactEmail || null : null,
    });
    acces[d.cle] = { role: d.role, ...identites[d.cle], identifiant, password };
  }

  await enregistrerActivite({
    acteur: session,
    action: "CREATION",
    cibleType: "promoteur",
    cibleId: promoteur.id,
    cibleNom: nom,
    details: `Trois directions créées : ${DIRECTIONS.map((d) => `${d.libelle} ${acces[d.cle].identifiant}`).join(", ")}`,
    promoteurId: promoteur.id,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/journal");
  return { success: { promoteur: nom, acces } };
}

export async function activerAbonnement(promoteurId: string, formule: string, dureeMois: number) {
  const session = await requireRole(["SUPER_ADMIN"]);
  const debut = new Date();
  const fin = new Date(debut);
  fin.setMonth(fin.getMonth() + dureeMois);

  await db
    .update(promoteurs)
    .set({ statut: "ACTIF", abonnementFormule: formule, abonnementDebut: debut, abonnementFin: fin })
    .where(eq(promoteurs.id, promoteurId));
  invaliderTousLesEtats();
  const p = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, promoteurId) });
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "promoteur",
    cibleId: promoteurId,
    cibleNom: p?.nom ?? promoteurId,
    details: `Abonnement activé : ${formule}, ${dureeMois} mois`,
    promoteurId,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/journal");
}

export async function suspendrePromoteur(promoteurId: string) {
  const session = await requireRole(["SUPER_ADMIN"]);
  await db.update(promoteurs).set({ statut: "SUSPENDU" }).where(eq(promoteurs.id, promoteurId));
  invaliderTousLesEtats(); // toutes les sessions du promoteur sont révoquées dès la requête suivante
  const p = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, promoteurId) });
  await enregistrerActivite({
    acteur: session,
    action: "SUSPENSION",
    cibleType: "promoteur",
    cibleId: promoteurId,
    cibleNom: p?.nom ?? promoteurId,
    details: "Abonnement suspendu : les comptes du promoteur ne peuvent plus se connecter",
    promoteurId,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/journal");
}
