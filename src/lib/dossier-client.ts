import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { contratActif, contratsSupprimes } from "@/lib/contrats";
import {
  biens,
  demandesTma,
  desistements,
  echeances,
  paiements,
  projets,
  propositions,
  syndics,
  visites,
  type clients,
} from "@/db/schema";

/*
 * Dossier d'un client, bien par bien : la fiche client (/dashboard/clients/[id])
 * est le point d'entrée unique de gestion. Chaque onglet (contrat, échéancier
 * et paiements, travaux modificatifs, documents) ne montre que les données du
 * couple (client, bien) sélectionné — jamais celles d'un autre bien du même
 * client, ni celles d'un ancien client du même bien.
 */

export type Client = typeof clients.$inferSelect;
export type Bien = typeof biens.$inferSelect;

export const ONGLETS = ["contrat", "paiements", "tma", "documents"] as const;
export type Onglet = (typeof ONGLETS)[number];
export const ONGLET_LABELS: Record<Onglet, string> = {
  contrat: "Contrat",
  paiements: "Échéancier & Paiements",
  tma: "Travaux modificatifs",
  documents: "Documents",
};
export function lireOnglet(valeur: string | undefined): Onglet {
  return (ONGLETS as readonly string[]).includes(valeur ?? "") ? (valeur as Onglet) : "contrat";
}

/** Lien vers un onglet de la fiche client pour un bien donné (utilisé par les pages d'index). */
export function lienFicheClient(clientId: string, bienId: string, onglet: Onglet) {
  return `/dashboard/clients/${clientId}?bien=${bienId}&onglet=${onglet}`;
}

export type BienDuClient = { bien: Bien; projet: typeof projets.$inferSelect | undefined; desiste: boolean };

/**
 * Biens rattachés au client : ceux qu'il détient (vendus, livrés, proposition
 * en cours) puis ceux dont il s'est désisté (le dossier — remboursement,
 * contrat annulé — reste consultable).
 */
export async function biensDuClient(client: Client): Promise<BienDuClient[]> {
  const detenus = await db.query.biens.findMany({ where: eq(biens.clientId, client.id), orderBy: [asc(biens.designation)] });
  const desistes = await db.query.desistements.findMany({ where: eq(desistements.clientId, client.id), orderBy: [desc(desistements.createdAt)] });
  const idsDesistes = [...new Set(desistes.map((d) => d.bienId))].filter((id) => !detenus.some((b) => b.id === id));
  const biensDesistes = idsDesistes.length ? await db.query.biens.findMany({ where: inArray(biens.id, idsDesistes) }) : [];
  const tous = [...detenus.map((bien) => ({ bien, desiste: false })), ...biensDesistes.map((bien) => ({ bien, desiste: true }))];
  const projetIds = [...new Set(tous.map((t) => t.bien.projetId))];
  const listeProjets = projetIds.length ? await db.query.projets.findMany({ where: inArray(projets.id, projetIds) }) : [];
  const projetById = new Map(listeProjets.map((p) => [p.id, p]));
  return tous.map((t) => ({ ...t, projet: projetById.get(t.bien.projetId) }));
}

/** Tout ce que la fiche affiche pour un couple (client, bien) — rien d'un autre bien ni d'un autre client. */
export async function chargerDossierBien(client: Client, bien: Bien) {
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  // Proposition de CE client sur CE bien (acceptée, ou désistée ensuite), la plus récente
  const proposition = await db.query.propositions.findFirst({
    where: and(eq(propositions.bienId, bien.id), eq(propositions.clientId, client.id), or(eq(propositions.statut, "ACCEPTEE"), eq(propositions.statut, "DESISTEE"))),
    orderBy: [desc(propositions.createdAt)],
  });
  const echeancier = proposition
    ? await db.query.echeances.findMany({ where: eq(echeances.propositionId, proposition.id), orderBy: [asc(echeances.numero)] })
    : [];
  const desistement = await db.query.desistements.findFirst({
    where: and(eq(desistements.bienId, bien.id), eq(desistements.clientId, client.id)),
    orderBy: [desc(desistements.createdAt)],
  });
  // Contrat actif (non supprimé) du bien pour ce client ; après désistement, le contrat annulé de ce client
  const contrat = await contratActif(bien.id, client.id);
  const supprimes = await contratsSupprimes(bien.id, client.id);
  const listePaiements = await db.query.paiements.findMany({
    where: and(eq(paiements.bienId, bien.id), eq(paiements.clientId, client.id)),
    orderBy: [desc(paiements.createdAt)],
  });
  const listeSyndics = await db.query.syndics.findMany({
    where: and(eq(syndics.bienId, bien.id), eq(syndics.clientId, client.id)),
    orderBy: [desc(syndics.createdAt)],
  });
  const ORDRE_TMA: Record<string, number> = { DEMANDE: 0, CHIFFRE: 1, SIGNE: 2, EN_COURS: 3, TERMINE: 4, REFUSE: 5 };
  const listeTma = (
    await db.query.demandesTma.findMany({
      where: and(eq(demandesTma.bienId, bien.id), eq(demandesTma.clientId, client.id)),
      orderBy: [desc(demandesTma.createdAt)],
    })
  ).sort((a, b) => (ORDRE_TMA[a.statut] ?? 9) - (ORDRE_TMA[b.statut] ?? 9));
  const listeVisites = await db.query.visites.findMany({
    where: and(eq(visites.bienId, bien.id), eq(visites.clientId, client.id)),
    orderBy: [desc(visites.createdAt)],
  });
  return { projet, proposition, echeancier, desistement, contrat, contratsSupprimes: supprimes, paiements: listePaiements, syndics: listeSyndics, tma: listeTma, visites: listeVisites };
}
export type DossierBien = Awaited<ReturnType<typeof chargerDossierBien>>;
