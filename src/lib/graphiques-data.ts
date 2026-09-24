import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, contrats, demandesTma, paiements, projets, propositions, prospects, visites } from "@/db/schema";
import type { SessionPayload } from "@/lib/auth";
import { granularite, type Granularite, type Plage } from "@/lib/plage-dates";
import { agreger, cumul, dansLaPlage, intervalles, lignesDonnees, total, type LigneDonnees } from "@/lib/graphiques";

/*
 * Données des graphiques du tableau de bord, par rôle et pour la plage de
 * dates choisie : totaux (cartes Stat), un graphique en barres et une courbe.
 * Les requêtes restent cloisonnées au promoteur de la session ; le commercial
 * ne voit que ses propres ventes et prospects.
 */

export type Unite = "nombre" | "mad";
export type StatPeriode = { cle: string; label: string; valeur: number; unite: Unite; hint?: string };
export type Graphique = { titre: string; description?: string; series: { cle: string; libelle: string }[]; lignes: LigneDonnees[]; unite: Unite; total: number };
export type DonneesTableauDeBord = { stats: StatPeriode[]; barres: Graphique; courbe: Graphique; granularite: Granularite };

async function biensDuPromoteur(promoteurId: string) {
  const listeProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, promoteurId) });
  const ids = listeProjets.map((p) => p.id);
  const liste = ids.length ? await db.query.biens.findMany({ where: inArray(biens.projetId, ids) }) : [];
  return new Map(liste.map((b) => [b.id, b]));
}

export async function donneesTableauDeBord(session: SessionPayload, plage: Plage): Promise<DonneesTableauDeBord> {
  const promoteurId = session.promoteurId!;
  const gran = granularite(plage);
  const liste = intervalles(plage, gran);
  const bienById = await biensDuPromoteur(promoteurId);
  const bienIds = [...bienById.keys()];
  const unite = { jour: "par jour", semaine: "par semaine", mois: "par mois" }[gran];
  // Barres : total = somme de la première série ; courbe cumulée : total = dernière valeur du cumul
  const g = (titre: string, series: { cle: string; libelle: string; valeurs: number[] }[], u: Unite, mode: "somme" | "cumul", description?: string): Graphique => ({
    titre,
    description,
    unite: u,
    series: series.map((s) => ({ cle: s.cle, libelle: s.libelle })),
    lignes: lignesDonnees(liste, series),
    total: mode === "somme" ? total(series[0].valeurs) : (series[0].valeurs[series[0].valeurs.length - 1] ?? 0),
  });
  const role = session.role;

  // --- Ventes conclues (propositions acceptées) ---
  if (["PDG", "DIRECTEUR_COMMERCIAL", "COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(role)) {
    const personnel = role === "COMMERCIAL";
    const ventes = (bienIds.length ? await db.query.propositions.findMany({ where: and(inArray(propositions.bienId, bienIds), eq(propositions.statut, "ACCEPTEE")) }) : [])
      .filter((p) => !personnel || p.commercialId === session.userId)
      .filter((p) => dansLaPlage(p.decidedAt, plage))
      .map((p) => ({ date: p.decidedAt, valeur: bienById.get(p.bienId)?.prix ?? 0 }));
    const nbVentes = agreger(liste, ventes);
    const ca = agreger(liste, ventes, "somme");
    if (role === "PDG" || role === "DIRECTEUR_COMMERCIAL") {
      return {
        granularite: gran,
        stats: [
          { cle: "ventes", label: "Ventes conclues", valeur: total(nbVentes), unite: "nombre" },
          { cle: "ca", label: "Chiffre d'affaires", valeur: total(ca), unite: "mad" },
          { cle: "panier", label: "Prix moyen", valeur: total(nbVentes) ? Math.round(total(ca) / total(nbVentes)) : 0, unite: "mad" },
        ],
        barres: g(`Ventes conclues ${unite}`, [{ cle: "ventes", libelle: "Ventes", valeurs: nbVentes }], "nombre", "somme"),
        courbe: g("Chiffre d'affaires cumulé", [{ cle: "ca", libelle: "CA cumulé", valeurs: cumul(ca) }], "mad", "cumul", "Prix des biens vendus, cumulés depuis le début de la période"),
      };
    }
    // Commercial / Responsable Commercial : ventes personnelles et prospects
    const mesProspects = (await db.query.prospects.findMany({ where: eq(prospects.promoteurId, promoteurId) }))
      .filter((p) => !personnel || p.commercialId === session.userId)
      .filter((p) => dansLaPlage(p.createdAt, plage));
    const recus = agreger(liste, mesProspects.map((p) => ({ date: p.createdAt })));
    const traites = agreger(liste, mesProspects.filter((p) => p.statutContact !== "NON_CONTACTE").map((p) => ({ date: p.createdAt })));
    return {
      granularite: gran,
      stats: [
        { cle: "ventes", label: personnel ? "Mes ventes" : "Ventes de l'équipe", valeur: total(nbVentes), unite: "nombre" },
        { cle: "ca", label: "Chiffre d'affaires", valeur: total(ca), unite: "mad" },
        { cle: "prospects", label: "Prospects reçus", valeur: total(recus), unite: "nombre" },
        { cle: "traites", label: "Prospects traités", valeur: total(traites), unite: "nombre", hint: "Contactés parmi ceux reçus sur la période" },
      ],
      barres: g(`${personnel ? "Mes ventes" : "Ventes de l'équipe"} ${unite}`, [{ cle: "ventes", libelle: "Ventes", valeurs: nbVentes }], "nombre", "somme"),
      courbe: g("Prospects reçus et traités (cumul)", [{ cle: "recus", libelle: "Reçus", valeurs: cumul(recus) }, { cle: "traites", libelle: "Traités", valeurs: cumul(traites) }], "nombre", "cumul"),
    };
  }

  // --- Paiements validés (encaissements réels) ---
  if (["DIRECTEUR_FINANCIER", "COMPTABLE_INTERNE", "RECOUVREMENT"].includes(role)) {
    const valides = (bienIds.length ? await db.query.paiements.findMany({ where: and(inArray(paiements.bienId, bienIds), eq(paiements.statut, "VALIDE")) }) : [])
      .map((p) => ({ date: p.dateReception ?? p.validatedAt ?? p.dateOperation, valeur: p.montantExact ?? p.montant }))
      .filter((e) => dansLaPlage(e.date, plage));
    const montants = agreger(liste, valides, "somme");
    const nombres = agreger(liste, valides);
    const libelle = role === "RECOUVREMENT" ? "Montant récupéré" : "Encaissements réels";
    return {
      granularite: gran,
      stats: [
        { cle: "encaisse", label: libelle, valeur: total(montants), unite: "mad", hint: "Paiements validés par le Comptable Interne" },
        { cle: "operations", label: "Paiements validés", valeur: total(nombres), unite: "nombre" },
        { cle: "moyen", label: "Montant moyen", valeur: total(nombres) ? Math.round(total(montants) / total(nombres)) : 0, unite: "mad" },
      ],
      barres:
        role === "COMPTABLE_INTERNE"
          ? g(`Paiements validés ${unite}`, [{ cle: "operations", libelle: "Paiements", valeurs: nombres }], "nombre", "somme")
          : g(`${libelle} ${unite}`, [{ cle: "encaisse", libelle: "Montant", valeurs: montants }], "mad", "somme"),
      courbe: g(`${libelle} cumulés`, [{ cle: "cumul", libelle: "Cumul", valeurs: cumul(montants) }], "mad", "cumul"),
    };
  }

  // --- Contrats générés vs confirmés ---
  if (role === "RESPONSABLE_ADMINISTRATIF") {
    const liste_contrats = bienIds.length ? (await db.query.contrats.findMany({ where: inArray(contrats.bienId, bienIds) })).filter((c) => !c.deletedAt) : [];
    const crees = agreger(liste, liste_contrats.filter((c) => dansLaPlage(c.createdAt, plage)).map((c) => ({ date: c.createdAt })));
    const confirmes = agreger(liste, liste_contrats.filter((c) => dansLaPlage(c.confirmedAt, plage)).map((c) => ({ date: c.confirmedAt })));
    return {
      granularite: gran,
      stats: [
        { cle: "generes", label: "Contrats générés", valeur: total(crees), unite: "nombre", hint: "Créés à l'acceptation d'une vente" },
        { cle: "confirmes", label: "Contrats confirmés", valeur: total(confirmes), unite: "nombre" },
      ],
      barres: g(`Contrats générés et confirmés ${unite}`, [{ cle: "generes", libelle: "Générés", valeurs: crees }, { cle: "confirmes", libelle: "Confirmés", valeurs: confirmes }], "nombre", "somme"),
      courbe: g("Contrats confirmés (cumul)", [{ cle: "confirmes", libelle: "Confirmés", valeurs: cumul(confirmes) }], "nombre", "cumul"),
    };
  }

  // --- Prospects importés vs traités ---
  if (role === "ASSISTANT_ADMINISTRATIF") {
    const liste_prospects = (await db.query.prospects.findMany({ where: eq(prospects.promoteurId, promoteurId) })).filter((p) => dansLaPlage(p.createdAt, plage));
    const importes = agreger(liste, liste_prospects.map((p) => ({ date: p.createdAt })));
    const traites = agreger(liste, liste_prospects.filter((p) => p.statutContact !== "NON_CONTACTE").map((p) => ({ date: p.createdAt })));
    return {
      granularite: gran,
      stats: [
        { cle: "importes", label: "Prospects importés", valeur: total(importes), unite: "nombre" },
        { cle: "traites", label: "Prospects traités", valeur: total(traites), unite: "nombre", hint: "Contactés parmi ceux importés sur la période" },
      ],
      barres: g(`Prospects importés et traités ${unite}`, [{ cle: "importes", libelle: "Importés", valeurs: importes }, { cle: "traites", libelle: "Traités", valeurs: traites }], "nombre", "somme"),
      courbe: g("Prospects importés (cumul)", [{ cle: "importes", libelle: "Importés", valeurs: cumul(importes) }], "nombre", "cumul"),
    };
  }

  // --- SAV : demandes de visite et travaux modificatifs traités ---
  const liste_visites = bienIds.length ? (await db.query.visites.findMany({ where: inArray(visites.bienId, bienIds) })).filter((v) => v.statut !== "DEMANDEE" && dansLaPlage(v.decidedAt, plage)) : [];
  const liste_tma = bienIds.length ? (await db.query.demandesTma.findMany({ where: inArray(demandesTma.bienId, bienIds) })).filter((d) => d.statut !== "DEMANDE" && dansLaPlage(d.dateDemande, plage)) : [];
  const visitesTraitees = agreger(liste, liste_visites.map((v) => ({ date: v.decidedAt })));
  const tmaTraitees = agreger(liste, liste_tma.map((d) => ({ date: d.dateDemande })));
  return {
    granularite: gran,
    stats: [
      { cle: "visites", label: "Visites traitées", valeur: total(visitesTraitees), unite: "nombre", hint: "Acceptées ou refusées" },
      { cle: "tma", label: "Travaux modificatifs traités", valeur: total(tmaTraitees), unite: "nombre", hint: "Chiffrés ou refusés" },
    ],
    barres: g(`Demandes traitées ${unite}`, [{ cle: "visites", libelle: "Visites", valeurs: visitesTraitees }, { cle: "tma", libelle: "Travaux modificatifs", valeurs: tmaTraitees }], "nombre", "somme"),
    courbe: g("Demandes traitées (cumul)", [{ cle: "cumul", libelle: "Visites + TMA", valeurs: cumul(visitesTraitees.map((v, i) => v + (tmaTraitees[i] ?? 0))) }], "nombre", "cumul"),
  };
}
