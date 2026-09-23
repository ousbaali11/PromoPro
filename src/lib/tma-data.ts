import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, projets, propositions, demandesTma } from "@/db/schema";
import { dateLimiteTma, tmaOuvert } from "./tma";

/** Date de blocage d'un bien vendu : acceptation de la proposition (première tranche), sinon création du bien. */
export async function dateBlocageDuBien(bien: { id: string; createdAt: Date | null }): Promise<Date> {
  const p = await db.query.propositions.findFirst({
    where: and(eq(propositions.bienId, bien.id), eq(propositions.statut, "ACCEPTEE")),
    orderBy: [desc(propositions.decidedAt)],
  });
  return p?.decidedAt ?? bien.createdAt ?? new Date();
}

/** Fenêtre TMA d'un bien : date limite et ouverture (statut + date), avec le délai du projet. */
export async function fenetreTma(bien: { id: string; projetId: string; statut: string; createdAt: Date | null }, now = new Date()) {
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  const delai = projet?.delaiTmaJours ?? 60;
  const blocage = await dateBlocageDuBien(bien);
  const dateLimite = dateLimiteTma(blocage, delai);
  return { delaiJours: delai, dateBlocage: blocage, dateLimite, ouvert: tmaOuvert(bien, dateLimite, now) };
}

export async function demandesTmaDuBien(bienId: string) {
  return db.query.demandesTma.findMany({ where: eq(demandesTma.bienId, bienId), orderBy: [desc(demandesTma.createdAt)] });
}

/** Une demande avec son bien, pour les contrôles d'accès (promoteur / client). */
export async function demandeTmaAvecBien(demandeId: string) {
  const demande = await db.query.demandesTma.findFirst({ where: eq(demandesTma.id, demandeId) });
  if (!demande) return null;
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, demande.bienId) });
  if (!bien) return null;
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet) return null;
  return { demande, bien, projet };
}
