"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { projets, biens, epingles } from "@/db/schema";
import { requireRole, requireStaffSession } from "@/lib/session";
import { enregistrerActivite, decrireChangements } from "@/lib/journal";
import { lireNombre, verifierMontant, verifierDelaiTma, verifierTexte, LONGUEURS } from "@/lib/validation";

export async function createProjet(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const nomCompte = String(formData.get("nomCompte") ?? "").trim();
  const iban = String(formData.get("iban") ?? "").trim();

  if (!nom || !nomCompte || !iban) {
    return { error: "Merci de renseigner le nom du projet, le nom du compte et l'IBAN." };
  }
  const tropLong =
    verifierTexte(nom, { libelle: "Le nom du projet", max: LONGUEURS.courte }) ??
    verifierTexte(nomCompte, { libelle: "Le nom du compte", max: LONGUEURS.courte }) ??
    verifierTexte(iban, { libelle: "L'IBAN", max: LONGUEURS.courte });
  if (tropLong) return { error: tropLong };

  const [projet] = await db
    .insert(projets)
    .values({ promoteurId: session.promoteurId!, nom, nomCompte, iban, createdById: session.userId })
    .returning();

  await enregistrerActivite({
    acteur: session,
    action: "CREATION",
    cibleType: "projet",
    cibleId: projet.id,
    cibleNom: nom,
    details: `Compte ${nomCompte} · IBAN ${iban}`,
  });

  revalidatePath("/dashboard/projets");
  revalidatePath("/dashboard/journal");
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
  const prix = lireNombre(formData.get("prix"));
  const surface = lireNombre(formData.get("surface"));

  if (!projetId || !designation) {
    return { error: "Merci de compléter tous les champs du bien (désignation, prix, surface)." };
  }
  const invalide =
    verifierTexte(designation, { libelle: "La désignation", max: LONGUEURS.designation }) ??
    verifierMontant(prix, { libelle: "Le prix" }) ??
    verifierMontant(surface, { libelle: "La surface" });
  if (invalide) return { error: invalide };
  if (!(await projetDuPromoteur(projetId, session.promoteurId))) return { error: "Projet introuvable." };

  const [bien] = await db.insert(biens).values({ projetId, designation, nature, prix, surface }).returning();
  await enregistrerActivite({
    acteur: session,
    action: "CREATION",
    cibleType: "bien",
    cibleId: bien.id,
    cibleNom: designation,
    details: `${nature} · ${prix} MAD · ${surface} m²`,
  });

  revalidatePath(`/dashboard/projets/${projetId}`);
  revalidatePath("/dashboard/journal");
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
  await enregistrerActivite({
    acteur: session,
    action: "SUPPRESSION",
    cibleType: "bien",
    cibleId: bienId,
    cibleNom: bien.designation,
    details: `Bien retiré du tableau de contenance (${bien.statut === "DISPONIBLE" ? "disponible" : "bloqué"}, ${bien.prix} MAD)`,
  });
  revalidatePath(`/dashboard/projets/${projetId}`);
  revalidatePath("/dashboard/journal");
}

export type ModifState = { error?: string } | undefined;

/** Le Directeur Commercial corrige le nom, le compte ou l'IBAN d'un projet. */
export async function modifierProjet(_prev: ModifState, formData: FormData): Promise<ModifState> {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);
  const projetId = String(formData.get("projetId") ?? "");
  const projet = await projetDuPromoteur(projetId, session.promoteurId);
  if (!projet) return { error: "Projet introuvable." };

  const delaiTmaJours = lireNombre(formData.get("delaiTmaJours"));
  const erreurDelai = verifierDelaiTma(delaiTmaJours);
  if (erreurDelai) return { error: erreurDelai };
  const apres = {
    nom: String(formData.get("nom") ?? "").trim(),
    nomCompte: String(formData.get("nomCompte") ?? "").trim(),
    iban: String(formData.get("iban") ?? "").trim(),
    delaiTmaJours,
  };
  if (!apres.nom || !apres.nomCompte || !apres.iban) {
    return { error: "Merci de renseigner le nom du projet, le nom du compte et l'IBAN." };
  }
  const tropLong =
    verifierTexte(apres.nom, { libelle: "Le nom du projet", max: LONGUEURS.courte }) ??
    verifierTexte(apres.nomCompte, { libelle: "Le nom du compte", max: LONGUEURS.courte }) ??
    verifierTexte(apres.iban, { libelle: "L'IBAN", max: LONGUEURS.courte });
  if (tropLong) return { error: tropLong };
  const details = decrireChangements(projet, apres, { nom: "Nom", nomCompte: "Nom du compte", iban: "IBAN", delaiTmaJours: "Délai TMA (jours)" });
  if (!details) return { error: "Aucune modification à enregistrer." };

  await db.update(projets).set(apres).where(eq(projets.id, projetId));
  await enregistrerActivite({ acteur: session, action: "MODIFICATION", cibleType: "projet", cibleId: projetId, cibleNom: apres.nom, details });

  revalidatePath("/dashboard/projets");
  revalidatePath(`/dashboard/projets/${projetId}`);
  revalidatePath("/dashboard/journal");
  redirect(`/dashboard/projets/${projetId}`);
}

/** Le Directeur Commercial corrige un bien tant qu'il est encore disponible (jamais après une proposition ou une vente). */
export async function modifierBien(_prev: ModifState, formData: FormData): Promise<ModifState> {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);
  const bienId = String(formData.get("bienId") ?? "");
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien || !(await projetDuPromoteur(bien.projetId, session.promoteurId))) return { error: "Bien introuvable." };
  if (bien.statut !== "DISPONIBLE") {
    return { error: "Ce bien n'est plus modifiable : une proposition ou une vente est en cours ou conclue." };
  }

  const apres = {
    designation: String(formData.get("designation") ?? "").trim(),
    nature: String(formData.get("nature") ?? "").trim(),
    prix: lireNombre(formData.get("prix")),
    surface: lireNombre(formData.get("surface")),
  };
  if (!apres.designation || !apres.nature) {
    return { error: "Merci de compléter la désignation, la nature, le prix et la surface." };
  }
  const invalide =
    verifierTexte(apres.designation, { libelle: "La désignation", max: LONGUEURS.designation }) ??
    verifierMontant(apres.prix, { libelle: "Le prix" }) ??
    verifierMontant(apres.surface, { libelle: "La surface" });
  if (invalide) return { error: invalide };
  const details = decrireChangements(bien, apres, { designation: "Désignation", nature: "Nature", prix: "Prix", surface: "Surface" });
  if (!details) return { error: "Aucune modification à enregistrer." };

  await db.update(biens).set(apres).where(eq(biens.id, bienId));
  await enregistrerActivite({ acteur: session, action: "MODIFICATION", cibleType: "bien", cibleId: bienId, cibleNom: apres.designation, details });

  revalidatePath(`/dashboard/projets/${bien.projetId}`);
  revalidatePath(`/dashboard/biens/${bienId}`);
  revalidatePath("/dashboard/journal");
  redirect(`/dashboard/biens/${bienId}`);
}
