"use server";

import { and, eq } from "drizzle-orm";
import { MESSAGE_NATURE_INVALIDE, NATURE_PAR_DEFAUT, natureValide } from "@/lib/natures-biens";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { projets, biens, epingles } from "@/db/schema";
import { requireRole, requireStaffSession } from "@/lib/session";
import { enregistrerActivite, decrireChangements } from "@/lib/journal";
import { lireNombre, verifierMontant, verifierDelaiTma, verifierTexte, LONGUEURS } from "@/lib/validation";
import { analyserLignesBiens, MAX_LIGNES_IMPORT_BIENS, resoudreNature, type LigneBien, type LigneBienIgnoree } from "@/lib/biens-import";
import { designationsConnues } from "@/lib/biens-import-db";
import { lireFeuille, verifierFichierImport } from "@/lib/import-excel";
import { consommer, LIMITES, messageLimite } from "@/lib/rate-limit";

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
  const nature = String(formData.get("nature") ?? NATURE_PAR_DEFAUT).trim();
  const prix = lireNombre(formData.get("prix"));
  const surface = lireNombre(formData.get("surface"));

  if (!projetId || !designation) {
    return { error: "Merci de compléter tous les champs du bien (désignation, prix, surface)." };
  }
  const invalide =
    verifierTexte(designation, { libelle: "La désignation", max: LONGUEURS.designation }) ??
    verifierMontant(prix, { libelle: "Le prix" }) ??
    verifierMontant(surface, { libelle: "La surface" }) ??
    (natureValide(nature) ? null : MESSAGE_NATURE_INVALIDE);
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
  // Une nature historique hors liste peut être conservée telle quelle, jamais remplacée par une valeur hors liste
  if (!natureValide(apres.nature) && apres.nature !== bien.nature) return { error: MESSAGE_NATURE_INVALIDE };
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

// ---------------------------------------------------------------------------
// Import Excel des biens d'un projet (Directeur Commercial), sur le modèle de
// l'import des prospects : analyse en mémoire puis confirmation ; rien n'est
// écrit avant la confirmation, les lignes invalides sont ignorées et comptées.
// ---------------------------------------------------------------------------

export type ApercuImportBiens = { projetId: string; nomFichier: string; valides: LigneBien[]; ignorees: LigneBienIgnoree[] };
export type AnalyseImportBiensState = { error?: string; apercu?: ApercuImportBiens } | undefined;
export type ConfirmationImportBiensState = { error?: string; resultat?: { importes: number; ignorees: number } } | undefined;

/** Étape 1 — lecture du fichier en mémoire et contrôle des lignes (aucune écriture). */
export async function analyserImportBiens(_prev: AnalyseImportBiensState, formData: FormData): Promise<AnalyseImportBiensState> {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);
  const limite = consommer(`import-biens:${session.userId}`, LIMITES.importBiens.max, LIMITES.importBiens.fenetreMs);
  if (!limite.autorise) return { error: messageLimite(limite.reessaiDansSec) };
  const projetId = String(formData.get("projetId") ?? "");
  if (!projetId || !(await projetDuPromoteur(projetId, session.promoteurId))) return { error: "Projet introuvable." };
  const fichier = formData.get("fichier");
  const refus = verifierFichierImport(fichier);
  if (refus) return { error: refus };
  const nomFichier = (fichier as File).name;

  let lignes: Record<string, unknown>[];
  try {
    lignes = lireFeuille(Buffer.from(await (fichier as File).arrayBuffer()));
  } catch {
    return { error: "Fichier illisible : vérifiez qu'il s'agit bien d'un classeur Excel." };
  }
  if (lignes.length === 0) return { error: "La première feuille du classeur est vide." };
  if (lignes.length > MAX_LIGNES_IMPORT_BIENS) return { error: `Fichier trop long : ${MAX_LIGNES_IMPORT_BIENS} lignes maximum par import.` };

  const { valides, ignorees, colonnes } = analyserLignesBiens(lignes, { designationsExistantes: await designationsConnues(projetId) });
  const manquantes = (["designation", "nature", "prix", "surface"] as const).filter((c) => !colonnes[c]);
  if (manquantes.length) {
    return { error: `Colonne ${manquantes.join(", ")} introuvable dans les en-têtes. Colonnes attendues : désignation, nature, prix, surface (ordre libre).` };
  }
  if (valides.length === 0) {
    return { error: `Aucun bien valide : ${ignorees.length} ligne${ignorees.length > 1 ? "s" : ""} ignorée${ignorees.length > 1 ? "s" : ""} (${ignorees.map((i) => `ligne ${i.ligne} : ${i.motif}`).slice(0, 5).join(" ; ")}${ignorees.length > 5 ? " ; …" : ""}).` };
  }
  return { apercu: { projetId, nomFichier, valides, ignorees } };
}

/** Lignes de l'aperçu renvoyées par le navigateur, revalidées une à une (défense contre un aperçu forgé). */
function lireBiensConfirmes(brut: FormDataEntryValue | null): LigneBien[] | null {
  if (typeof brut !== "string") return null;
  try {
    const data: unknown = JSON.parse(brut);
    if (!Array.isArray(data) || data.length === 0 || data.length > MAX_LIGNES_IMPORT_BIENS) return null;
    const lignes: LigneBien[] = [];
    for (const l of data) {
      if (!l || typeof l !== "object") return null;
      const { designation, nature, prix, surface } = l as Record<string, unknown>;
      if (typeof designation !== "string" || typeof nature !== "string" || typeof prix !== "number" || typeof surface !== "number") return null;
      const natureCanonique = resoudreNature(nature);
      if (!natureCanonique) return null;
      if (verifierTexte(designation.trim(), { libelle: "La désignation", max: LONGUEURS.designation, obligatoire: true })) return null;
      if (verifierMontant(prix, { libelle: "Le prix" }) || verifierMontant(surface, { libelle: "La surface" })) return null;
      lignes.push({ designation: designation.trim(), nature: natureCanonique, prix, surface });
    }
    return lignes;
  } catch {
    return null;
  }
}

/**
 * Étape 2 — création des biens au statut « Disponible » (comme à la création
 * manuelle), doublons apparus depuis l'aperçu écartés, trace au journal.
 */
export async function confirmerImportBiens(_prev: ConfirmationImportBiensState, formData: FormData): Promise<ConfirmationImportBiensState> {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);
  const projetId = String(formData.get("projetId") ?? "");
  const projet = projetId ? await projetDuPromoteur(projetId, session.promoteurId) : null;
  if (!projet) return { error: "Projet introuvable." };
  const nomFichier = String(formData.get("nomFichier") ?? "").slice(0, 200);
  const lignes = lireBiensConfirmes(formData.get("lignes"));
  if (!lignes) return { error: "Aperçu invalide : relancez l'analyse du fichier." };
  const ignoreesApercu = Math.max(0, Math.min(MAX_LIGNES_IMPORT_BIENS, Math.floor(Number(formData.get("ignorees")) || 0)));

  // Re-contrôle des désignations déjà présentes (ajoutées entre l'aperçu et la confirmation)
  const { valides, ignorees: ignoreesConfirmation } = analyserLignesBiens(
    lignes.map((l) => ({ designation: l.designation, nature: l.nature, prix: String(l.prix), surface: String(l.surface) })),
    { designationsExistantes: await designationsConnues(projetId), premiereLigne: 1 },
  );
  if (valides.length === 0) return { error: "Tous les biens de l'aperçu existent déjà dans le projet." };
  const ignorees = ignoreesApercu + ignoreesConfirmation.length;

  await db.insert(biens).values(valides.map((b) => ({ projetId, designation: b.designation, nature: b.nature, prix: b.prix, surface: b.surface })));
  await enregistrerActivite({
    acteur: session,
    action: "IMPORT",
    cibleType: "biens",
    cibleId: projetId,
    cibleNom: `${valides.length} bien${valides.length > 1 ? "s" : ""} importé${valides.length > 1 ? "s" : ""}${nomFichier ? ` (${nomFichier})` : ""}`,
    details: `Projet ${projet.nom}${ignorees ? ` ; ${ignorees} ligne${ignorees > 1 ? "s" : ""} ignorée${ignorees > 1 ? "s" : ""}` : ""}`,
  });
  revalidatePath(`/dashboard/projets/${projetId}`);
  revalidatePath("/dashboard/journal");
  return { resultat: { importes: valides.length, ignorees } };
}
