import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, clients, contratModeles, contratSections, contrats, echeances, paiements, projets, propositions } from "@/db/schema";
import { chargerPromoteur } from "@/lib/promoteurs";
import { genererEtStockerContrat } from "@/lib/pdf/contrat";
import { valeursDepuisDonnees } from "@/lib/contrats-valeurs";
import {
  SECTIONS_PAR_DEFAUT,
  archiverPdf,
  contientJetons,
  lireHistoriquePdf,
  lireModeleStocke,
  rendreTexte,
  resoudreModele,
  type SectionContrat,
  type SectionModele,
  type SectionTexte,
  type ValeursContrat,
} from "@/lib/contrats-sections";

/*
 * Contrats par sections — accès aux données (serveur). Un contrat actif est
 * un contrat non supprimé (suppression douce : `deleted_at`) ; ses sections
 * sont créées au premier accès à partir du modèle par défaut du promoteur,
 * sinon du jeu de sections intégré. Chaque génération de PDF archive la
 * version précédente dans `historique_pdf` (jamais supprimée).
 */

export type Contrat = typeof contrats.$inferSelect;

/** Dernier contrat non supprimé du bien (pour ce client si précisé, ou sans client renseigné : contrats antérieurs à la colonne). */
export async function contratActif(bienId: string, clientId?: string | null): Promise<Contrat | null> {
  const liste = await db.query.contrats.findMany({ where: and(eq(contrats.bienId, bienId), isNull(contrats.deletedAt)), orderBy: [desc(contrats.createdAt)] });
  return liste.find((c) => !clientId || !c.clientId || c.clientId === clientId) ?? null;
}

/** Contrats supprimés (suppression douce) du bien pour ce client : consultables dans l'historique de la fiche. */
export async function contratsSupprimes(bienId: string, clientId: string): Promise<Contrat[]> {
  const liste = await db.query.contrats.findMany({ where: eq(contrats.bienId, bienId), orderBy: [desc(contrats.createdAt)] });
  return liste.filter((c) => c.deletedAt && (!c.clientId || c.clientId === clientId));
}

/** Tout ce qu'il faut pour fusionner et générer un contrat : bien, client, projet, promoteur, échéancier, paiements validés. */
export async function contexteContrat(contrat: Contrat) {
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, contrat.bienId) });
  if (!bien) throw new Error("Bien du contrat introuvable.");
  const clientId = contrat.clientId ?? bien.clientId;
  const client = clientId ? await db.query.clients.findFirst({ where: eq(clients.id, clientId) }) : null;
  if (!client) throw new Error("Client du contrat introuvable.");
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet) throw new Error("Projet du bien introuvable.");
  const promoteur = await chargerPromoteur(projet.promoteurId);
  const proposition = await db.query.propositions.findFirst({
    where: and(eq(propositions.bienId, bien.id), eq(propositions.clientId, client.id)),
    orderBy: [desc(propositions.createdAt)],
  });
  const echeancier = proposition
    ? await db.query.echeances.findMany({ where: eq(echeances.propositionId, proposition.id), orderBy: [asc(echeances.numero)] })
    : [];
  const paiementsBien = await db.query.paiements.findMany({ where: and(eq(paiements.bienId, bien.id), eq(paiements.clientId, client.id)) });
  return { bien, client, projet, promoteur, echeancier, paiements: paiementsBien, reference: contrat.id.slice(0, 8).toUpperCase() };
}
export type ContexteContrat = Awaited<ReturnType<typeof contexteContrat>>;

/** Valeurs des jetons de fusion pour un contrat. */
export function valeursContrat(ctx: ContexteContrat): ValeursContrat {
  return valeursDepuisDonnees({ bien: ctx.bien, client: ctx.client, projet: ctx.projet, promoteur: ctx.promoteur, echeancier: ctx.echeancier, reference: ctx.reference });
}

/** Modèle par défaut du promoteur (sections en segments : texte + champs), s'il en a enregistré un ; format hérité lu et converti à la volée. */
export async function modeleDuPromoteur(promoteurId: string): Promise<(typeof contratModeles.$inferSelect & { sectionsListe: SectionModele[] }) | null> {
  const modele = await db.query.contratModeles.findFirst({ where: eq(contratModeles.promoteurId, promoteurId), orderBy: [desc(contratModeles.updatedAt)] });
  if (!modele) return null;
  const sections = lireModeleStocke(modele.sections);
  return sections ? { ...modele, sectionsListe: sections } : null;
}

/** Sections de départ d'un contrat : le modèle du promoteur (sinon le jeu intégré) résolu avec les données du dossier — du texte simple. */
export async function sectionsInitiales(ctx: ContexteContrat): Promise<SectionTexte[]> {
  const modele = await modeleDuPromoteur(ctx.projet.promoteurId);
  return resoudreModele(modele?.sectionsListe ?? SECTIONS_PAR_DEFAUT, valeursContrat(ctx));
}

/**
 * Sections du contrat, créées au premier accès : chaque champ du modèle est
 * remplacé par la donnée du dossier, et ce texte devient le contenu propre à
 * CE contrat (plus aucun jeton, aucune retransformation ensuite).
 */
export async function sectionsDuContrat(contrat: Contrat, ctx?: ContexteContrat): Promise<SectionContrat[]> {
  const existantes = await db.query.contratSections.findMany({ where: eq(contratSections.contratId, contrat.id), orderBy: [asc(contratSections.ordre)] });
  if (existantes.length) return existantes.map((s) => ({ id: s.id, titre: s.titre, contenu: s.contenu }));
  return remplacerSections(contrat.id, await sectionsInitiales(ctx ?? (await contexteContrat(contrat))));
}

/** Remplace toutes les sections d'un contrat par la liste donnée (ordre = position). */
export async function remplacerSections(contratId: string, liste: SectionTexte[]): Promise<SectionContrat[]> {
  await db.delete(contratSections).where(eq(contratSections.contratId, contratId));
  const creees: SectionContrat[] = [];
  for (const [i, s] of liste.entries()) {
    const [row] = await db.insert(contratSections).values({ contratId, ordre: i + 1, titre: s.titre, contenu: s.contenu }).returning();
    creees.push({ id: row.id, titre: row.titre, contenu: row.contenu });
  }
  return creees;
}

/**
 * Applique un formulaire de sections : mise à jour des sections conservées
 * (titre, texte, ordre), création des nouvelles, suppression des absentes.
 */
export async function appliquerSections(contratId: string, liste: (SectionTexte & { id: string | null })[]): Promise<SectionContrat[]> {
  const existantes = await db.query.contratSections.findMany({ where: eq(contratSections.contratId, contratId) });
  const conserves = new Set(liste.map((s) => s.id).filter((id): id is string => !!id));
  for (const e of existantes) if (!conserves.has(e.id)) await db.delete(contratSections).where(eq(contratSections.id, e.id));
  const resultat: SectionContrat[] = [];
  for (const [i, s] of liste.entries()) {
    if (s.id && existantes.some((e) => e.id === s.id)) {
      await db.update(contratSections).set({ ordre: i + 1, titre: s.titre, contenu: s.contenu }).where(eq(contratSections.id, s.id));
      resultat.push({ id: s.id, titre: s.titre, contenu: s.contenu });
    } else {
      const [row] = await db.insert(contratSections).values({ contratId, ordre: i + 1, titre: s.titre, contenu: s.contenu }).returning();
      resultat.push({ id: row.id, titre: row.titre, contenu: row.contenu });
    }
  }
  return resultat;
}

/**
 * Génère le PDF du contrat à partir de ses sections courantes, archive la
 * version précédente et enregistre la nouvelle. Le premier PDF confirme le
 * contrat (EN_ATTENTE → PRET) ; ensuite le statut est conservé.
 * Lève ErreurStockage si le disque refuse l'écriture (traduite par l'appelant).
 */
export async function genererPdfContrat(contrat: Contrat): Promise<{ pdfUrl: string; version: number; premiere: boolean }> {
  const ctx = await contexteContrat(contrat);
  const sections = await sectionsDuContrat(contrat, ctx);
  // Garde-fou : un jeton « {{cle}} » encore présent (données antérieures non migrées) est résolu ici, jamais écrit brut dans le PDF
  const valeurs = valeursContrat(ctx);
  const pdfUrl = await genererEtStockerContrat(ctx.bien, ctx.client, ctx.echeancier, {
    projet: ctx.projet,
    promoteur: ctx.promoteur,
    paiements: ctx.paiements,
    reference: ctx.reference,
    sections: sections.map((s) => ({ titre: s.titre, contenu: contientJetons(s.contenu) ? rendreTexte(s.contenu, valeurs) : s.contenu })),
  });
  // Mise à jour optimiste : l'historique est relu au moment d'écrire et l'écriture n'est acceptée que si le
  // PDF courant n'a pas changé entre-temps ; sinon on recommence sur l'état frais (deux générations presque
  // simultanées archivent chacune la version précédente, aucune n'est perdue ni dupliquée).
  for (let essai = 0; essai < 5; essai++) {
    const frais = essai === 0 ? contrat : await db.query.contrats.findFirst({ where: eq(contrats.id, contrat.id) });
    if (!frais) throw new Error("Contrat introuvable pendant la génération.");
    const historique = archiverPdf(lireHistoriquePdf(frais.historiquePdf), frais.pdfUrl, frais.pdfGenereAt ?? frais.confirmedAt);
    const premiere = frais.statut === "EN_ATTENTE";
    const [maj] = await db
      .update(contrats)
      .set({
        pdfUrl,
        pdfGenereAt: new Date(),
        historiquePdf: JSON.stringify(historique),
        ...(premiere ? { statut: "PRET", confirmedAt: new Date() } : {}),
      })
      .where(and(eq(contrats.id, contrat.id), frais.pdfUrl ? eq(contrats.pdfUrl, frais.pdfUrl) : isNull(contrats.pdfUrl)))
      .returning({ id: contrats.id });
    if (maj) return { pdfUrl, version: historique.length + 1, premiere };
  }
  throw new Error("Le contrat a été modifié pendant la génération du PDF : réessayez.");
}
