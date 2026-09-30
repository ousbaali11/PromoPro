"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { promoteurs, users, type Role } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";
import { enregistrerActivite } from "@/lib/journal";
import { invaliderTousLesEtats } from "@/lib/etat-compte";
import { parsePublicPath } from "@/lib/storage";
import { ROLE_LABELS } from "@/lib/roles";
import { estRoleDirection } from "@/lib/directions";
import { LONGUEURS, verifierTexte } from "@/lib/validation";
import { ajouterMois, dureeValide, echeanceProlongee, formulePour } from "@/lib/abonnement";
import { formatDate } from "@/lib/utils";

/** Chemins à rafraîchir après toute action sur un promoteur (liste et fiche). */
function rafraichirPromoteur(promoteurId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/promoteurs/${promoteurId}`);
  revalidatePath("/admin/journal");
}

/** Chemin d'un logo déposé via /api/upload (type « logos »), ou null ; toute autre valeur est ignorée. */
function lireLogo(valeur: FormDataEntryValue | null) {
  const p = parsePublicPath(String(valeur ?? ""));
  return p && p.type === "logos" ? String(valeur) : null;
}

export type LogoState = { error?: string; success?: true } | undefined;

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
  const logoUrl = lireLogo(formData.get("logoUrl"));
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
    .values({ nom, contactEmail: contactEmail || null, logoUrl, statut: "EN_ATTENTE" })
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

export async function activerAbonnement(promoteurId: string, dureeMois: number) {
  const session = await requireRole(["SUPER_ADMIN"]);
  if (!dureeValide(dureeMois)) return;
  const formule = formulePour(dureeMois);
  const debut = new Date();
  const fin = ajouterMois(debut, dureeMois);

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

  rafraichirPromoteur(promoteurId);
}

export type ResultatProlongation = { ok: true; echeance: string } | { error: string };

/**
 * Prolonge un abonnement ACTIF sans attendre son échéance : la durée choisie
 * s'ajoute à l'échéance en cours (ou part d'aujourd'hui si elle est passée),
 * le statut reste ACTIF, la formule prend celle de la durée. Un promoteur en
 * attente ou suspendu passe par Activer.
 */
export async function prolongerAbonnement(promoteurId: string, dureeMois: number): Promise<ResultatProlongation> {
  const session = await requireRole(["SUPER_ADMIN"]);
  if (!dureeValide(dureeMois)) return { error: "Durée de prolongation inconnue." };
  const p = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, promoteurId) });
  if (!p) return { error: "Promoteur introuvable." };
  if (p.statut !== "ACTIF") return { error: "Seul un abonnement actif peut être prolongé : activez-le d'abord." };
  const fin = echeanceProlongee(p.abonnementFin, dureeMois);
  const formule = formulePour(dureeMois);
  await db.update(promoteurs).set({ abonnementFormule: formule, abonnementFin: fin }).where(eq(promoteurs.id, promoteurId));
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "promoteur",
    cibleId: promoteurId,
    cibleNom: p.nom,
    details: `Abonnement prolongé de ${dureeMois} mois (${formule}) : échéance ${formatDate(p.abonnementFin)} → ${formatDate(fin)}`,
    promoteurId,
  });
  rafraichirPromoteur(promoteurId);
  return { ok: true, echeance: formatDate(fin) };
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
  rafraichirPromoteur(promoteurId);
}

/**
 * Dépose ou retire le logo d'un promoteur (optionnel) : repris en en-tête des
 * contrats, reçus, autorisations de visite et de l'espace client. Un champ
 * vide retire le logo.
 */
export async function definirLogoPromoteur(promoteurId: string, _prev: LogoState, formData: FormData): Promise<LogoState> {
  const session = await requireRole(["SUPER_ADMIN"]);
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, promoteurId) });
  if (!promoteur) return { error: "Promoteur introuvable." };
  const brut = String(formData.get("logoUrl") ?? "");
  const logoUrl = lireLogo(brut);
  if (brut && !logoUrl) return { error: "Le fichier déposé n'est pas un logo valide (PNG ou JPG)." };
  await db.update(promoteurs).set({ logoUrl }).where(eq(promoteurs.id, promoteurId));
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "promoteur",
    cibleId: promoteurId,
    cibleNom: promoteur.nom,
    details: logoUrl ? "Logo déposé" : "Logo retiré",
    promoteurId,
  });
  rafraichirPromoteur(promoteurId);
  revalidatePath("/client", "layout");
  return { success: true };
}

export type AjoutDirectionState = { error?: string; success?: Acces } | undefined;

const PREFIXE_DIRECTION: Record<string, string> = { PDG: "PDG", DIRECTEUR_COMMERCIAL: "DC", DIRECTEUR_FINANCIER: "DF" };

/**
 * Ajoute une direction (PDG, Directeur Commercial, Directeur Financier) à un
 * promoteur existant, à tout moment. Contrairement à la création du promoteur
 * (trois directions d'un coup), un rôle peut ainsi avoir plusieurs titulaires
 * — ou n'en avoir aucun après une suppression : aucune contrainte d'unicité.
 * Identifiant et mot de passe temporaire générés, affichés une seule fois.
 */
export async function ajouterDirection(promoteurId: string, _prev: AjoutDirectionState, formData: FormData): Promise<AjoutDirectionState> {
  const session = await requireRole(["SUPER_ADMIN"]);
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, promoteurId) });
  if (!promoteur) return { error: "Promoteur introuvable." };

  const role = String(formData.get("role") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!estRoleDirection(role)) return { error: "Le rôle doit être PDG, Directeur Commercial ou Directeur Financier." };
  const erreur =
    verifierTexte(nom, { libelle: "Le nom", max: LONGUEURS.nom, obligatoire: true }) ??
    verifierTexte(prenom, { libelle: "Le prénom", max: LONGUEURS.nom, obligatoire: true }) ??
    verifierTexte(email, { libelle: "L'e-mail", max: LONGUEURS.courte });
  if (erreur) return { error: erreur };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "L'e-mail n'est pas valide." };

  const identifiant = generateIdentifiant(PREFIXE_DIRECTION[role]);
  const password = generateTempPassword();
  const [cree] = await db
    .insert(users)
    .values({ promoteurId, role, nom, prenom, identifiant, passwordHash: await hashPassword(password), email: email || null })
    .returning();
  await enregistrerActivite({
    acteur: session,
    action: "CREATION",
    cibleType: "user",
    cibleId: cree.id,
    cibleNom: `${prenom} ${nom}`,
    details: `Direction ajoutée à ${promoteur.nom} : ${ROLE_LABELS[role]} · identifiant ${identifiant}`,
    promoteurId,
  });
  rafraichirPromoteur(promoteurId);
  return { success: { role, nom, prenom, identifiant, password } };
}
