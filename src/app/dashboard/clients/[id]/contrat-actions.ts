"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { biens, contratModeles, contrats, projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { enregistrerActivite } from "@/lib/journal";
import { tenterStockage } from "@/lib/stockage-erreurs";
import { notify } from "@/lib/notifications";
import { SECTIONS_PAR_DEFAUT, decrireChangementsSections, lireSectionsFormulaire } from "@/lib/contrats-sections";
import { appliquerSections, genererPdfContrat, modeleDuPromoteur, remplacerSections, sectionsDuContrat, type Contrat } from "@/lib/contrats";

/*
 * Éditeur de contrat (fiche client, onglet Contrat) — Responsable
 * Administratif uniquement. Chaque action porte sur UN contrat, vérifie qu'il
 * appartient au promoteur de la session, journalise ce qui a changé et
 * revalide la fiche. Les sauvegardes ne demandent pas de confirmation ; la
 * suppression (douce) et le remplacement des sections par le modèle passent
 * par un bouton à deux temps côté interface.
 */

export type EtatContrat = { error?: string; success?: string } | undefined;

type Session = Awaited<ReturnType<typeof requireRole>>;

async function contratDuPromoteur(contratId: string, session: Session): Promise<{ contrat: Contrat; bien: typeof biens.$inferSelect } | { error: string }> {
  const contrat = await db.query.contrats.findFirst({ where: eq(contrats.id, contratId) });
  if (!contrat) return { error: "Contrat introuvable." };
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, contrat.bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== session.promoteurId) return { error: "Contrat introuvable." };
  return { contrat, bien };
}

function revalider(bienId: string) {
  revalidatePath("/dashboard/clients/[id]", "page");
  revalidatePath("/dashboard/contrats");
  revalidatePath(`/client/biens/${bienId}`);
}

function lireFormulaire(formData: FormData) {
  return lireSectionsFormulaire(
    formData.getAll("sectionId").map(String),
    formData.getAll("titre").map(String),
    formData.getAll("contenu").map(String),
  );
}

/** Enregistre les sections (titres, textes, ordre) sans générer de PDF. */
export async function enregistrerSectionsContrat(contratId: string, _prev: EtatContrat, formData: FormData): Promise<EtatContrat> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const r = await contratDuPromoteur(contratId, session);
  if ("error" in r) return { error: r.error };
  if (r.contrat.deletedAt) return { error: "Ce contrat est supprimé : restaurez-le ou créez-en un nouveau." };
  const lu = lireFormulaire(formData);
  if ("error" in lu) return { error: lu.error };

  const avant = await sectionsDuContrat(r.contrat, session.promoteurId!);
  const changements = decrireChangementsSections(avant, lu.sections);
  if (!changements) return { success: "Aucune modification à enregistrer." };
  await appliquerSections(contratId, lu.sections);
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "contrat",
    cibleId: contratId,
    cibleNom: `Contrat ${r.bien.designation}`,
    details: changements,
  });
  revalider(r.bien.id);
  return { success: "Sections enregistrées." };
}

/** Enregistre les sections puis génère le PDF (archive de la version précédente). */
export async function enregistrerEtGenererContrat(contratId: string, _prev: EtatContrat, formData: FormData): Promise<EtatContrat> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const r = await contratDuPromoteur(contratId, session);
  if ("error" in r) return { error: r.error };
  if (r.contrat.deletedAt) return { error: "Ce contrat est supprimé : restaurez-le ou créez-en un nouveau." };
  const lu = lireFormulaire(formData);
  if ("error" in lu) return { error: lu.error };

  const avant = await sectionsDuContrat(r.contrat, session.promoteurId!);
  const changements = decrireChangementsSections(avant, lu.sections);
  if (changements) await appliquerSections(contratId, lu.sections);

  const generation = await tenterStockage("contrat (génération du PDF)", () => genererPdfContrat(r.contrat));
  if (!generation.ok) return { error: generation.error };
  const { version, premiere } = generation.valeur;

  await enregistrerActivite({
    acteur: session,
    action: premiere ? "CREATION" : "MODIFICATION",
    cibleType: "contrat",
    cibleId: contratId,
    cibleNom: `Contrat ${r.bien.designation}`,
    details: [premiere ? "PDF généré (version 1), contrat confirmé" : `PDF régénéré (version ${version}), version précédente archivée`, changements].filter(Boolean).join(" · "),
  });
  if (premiere && r.bien.commercialId) {
    await notify({
      userId: r.bien.commercialId,
      type: "CONTRAT_PRET",
      titre: "Contrat prêt",
      message: `Le contrat de ${r.bien.designation} est prêt : à imprimer sur place ou à envoyer par e-mail.`,
      lien: `/dashboard/clients/${r.contrat.clientId ?? r.bien.clientId}?bien=${r.bien.id}&onglet=contrat`,
    });
  }
  revalider(r.bien.id);
  return { success: premiere ? "Contrat confirmé : PDF généré (version 1)." : `PDF régénéré (version ${version}) ; la version précédente reste consultable.` };
}

/** Enregistre les sections courantes (avec leurs jetons) comme modèle par défaut du promoteur. */
export async function enregistrerModeleContrat(contratId: string): Promise<EtatContrat> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const r = await contratDuPromoteur(contratId, session);
  if ("error" in r) return { error: r.error };
  const sections = (await sectionsDuContrat(r.contrat, session.promoteurId!)).map((s) => ({ titre: s.titre, contenu: s.contenu }));
  const existant = await db.query.contratModeles.findFirst({ where: eq(contratModeles.promoteurId, session.promoteurId!) });
  if (existant) {
    await db.update(contratModeles).set({ sections: JSON.stringify(sections), updatedAt: new Date() }).where(eq(contratModeles.id, existant.id));
  } else {
    await db.insert(contratModeles).values({ promoteurId: session.promoteurId!, nom: "Modèle par défaut", sections: JSON.stringify(sections) });
  }
  await enregistrerActivite({
    acteur: session,
    action: existant ? "MODIFICATION" : "CREATION",
    cibleType: "contrat",
    cibleId: existant?.id ?? null,
    cibleNom: "Modèle de contrat par défaut",
    details: `${sections.length} section(s) : ${sections.map((s) => s.titre).join(", ")}`,
  });
  revalider(r.bien.id);
  return { success: "Modèle par défaut enregistré : les prochains contrats partiront de ces sections." };
}

/** Remplace les sections du contrat par le modèle du promoteur (ou le jeu intégré). Destructif : confirmation côté interface. */
export async function repartirDuModele(contratId: string): Promise<EtatContrat> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const r = await contratDuPromoteur(contratId, session);
  if ("error" in r) return { error: r.error };
  if (r.contrat.deletedAt) return { error: "Ce contrat est supprimé." };
  const modele = await modeleDuPromoteur(session.promoteurId!);
  await remplacerSections(contratId, modele?.sectionsListe ?? SECTIONS_PAR_DEFAUT);
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "contrat",
    cibleId: contratId,
    cibleNom: `Contrat ${r.bien.designation}`,
    details: modele ? "Sections remplacées par le modèle par défaut du promoteur" : "Sections remplacées par le jeu de sections intégré",
  });
  revalider(r.bien.id);
  return { success: modele ? "Sections remplacées par le modèle par défaut." : "Sections remplacées par le jeu de sections intégré." };
}

/** Suppression douce : le contrat reste consultable (PDF, historique, journal) ; un nouveau contrat peut être créé aussitôt. */
export async function supprimerContrat(contratId: string): Promise<EtatContrat> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const r = await contratDuPromoteur(contratId, session);
  if ("error" in r) return { error: r.error };
  if (r.contrat.deletedAt) return { error: "Ce contrat est déjà supprimé." };
  await db.update(contrats).set({ deletedAt: new Date() }).where(eq(contrats.id, contratId));
  await enregistrerActivite({
    acteur: session,
    action: "SUPPRESSION",
    cibleType: "contrat",
    cibleId: contratId,
    cibleNom: `Contrat ${r.bien.designation}`,
    details: `Statut au moment de la suppression : ${r.contrat.statut}${r.contrat.pdfUrl ? " · PDF conservé" : ""}`,
  });
  revalider(r.bien.id);
  return { success: "Contrat supprimé. Il reste consultable dans l'historique ; vous pouvez créer un nouveau contrat." };
}

/** Annule une suppression (bouton « Annuler » du toast, ou depuis l'historique) tant qu'aucun autre contrat actif n'existe. */
export async function restaurerContrat(contratId: string): Promise<EtatContrat> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const r = await contratDuPromoteur(contratId, session);
  if ("error" in r) return { error: r.error };
  if (!r.contrat.deletedAt) return { error: "Ce contrat n'est pas supprimé." };
  const autre = await db.query.contrats.findFirst({
    where: and(eq(contrats.bienId, r.bien.id), isNull(contrats.deletedAt), ne(contrats.id, contratId)),
  });
  if (autre && (!autre.clientId || autre.clientId === (r.contrat.clientId ?? r.bien.clientId))) {
    return { error: "Un autre contrat actif existe déjà pour ce bien : supprimez-le d'abord." };
  }
  await db.update(contrats).set({ deletedAt: null }).where(eq(contrats.id, contratId));
  await enregistrerActivite({ acteur: session, action: "RESTAURATION", cibleType: "contrat", cibleId: contratId, cibleNom: `Contrat ${r.bien.designation}` });
  revalider(r.bien.id);
  return { success: "Contrat restauré." };
}

/** Nouveau contrat (EN_ATTENTE) pour un bien vendu à ce client, quand il n'en a pas d'actif. */
export async function creerContrat(bienId: string, clientId: string): Promise<EtatContrat> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== session.promoteurId) return { error: "Bien introuvable." };
  if (bien.clientId !== clientId || !["VENDU", "LIVRE"].includes(bien.statut)) return { error: "Ce bien n'est pas vendu à ce client." };
  const actif = await db.query.contrats.findFirst({ where: and(eq(contrats.bienId, bienId), isNull(contrats.deletedAt)) });
  if (actif && (!actif.clientId || actif.clientId === clientId)) return { error: "Un contrat actif existe déjà pour ce bien." };
  const [contrat] = await db.insert(contrats).values({ bienId, clientId, statut: "EN_ATTENTE" }).returning();
  await enregistrerActivite({ acteur: session, action: "CREATION", cibleType: "contrat", cibleId: contrat.id, cibleNom: `Contrat ${bien.designation}`, details: "Nouveau contrat créé après suppression du précédent" });
  revalider(bien.id);
  return { success: "Nouveau contrat créé : complétez ses sections puis générez le PDF." };
}
