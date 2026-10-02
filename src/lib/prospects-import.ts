import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { prospects, users } from "@/db/schema";
import { telephoneCanonique, type ChargeCommercial } from "./prospects";

/*
 * Import Excel des prospects : le fichier est lu en mémoire (SheetJS) et n'est
 * jamais écrit sur le disque — il ne contient que des données de travail dont
 * la version de référence est la base une fois l'import confirmé, et rien ne
 * justifie d'en garder une copie (données personnelles de tiers). La
 * lecture elle-même est partagée avec l'import des biens (import-excel.ts).
 */

export { EXTENSIONS_IMPORT, MAX_TAILLE_IMPORT } from "./import-excel";
export { lireFeuille as lireFeuilleProspects } from "./import-excel";

/** Rôles qui reçoivent des prospects. */
export const ROLES_PROSPECTS = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"] as const;

export type CommercialDisponible = ChargeCommercial & { nom: string; prenom: string; role: string };

/**
 * Commerciaux actifs (ni suspendus ni supprimés) du promoteur, avec leur
 * nombre actuel de prospects NON_CONTACTE, dans un ordre stable (nom, prénom).
 */
export async function commerciauxDisponibles(promoteurId: string): Promise<CommercialDisponible[]> {
  const liste = await db.query.users.findMany({
    where: and(eq(users.promoteurId, promoteurId), inArray(users.role, [...ROLES_PROSPECTS]), eq(users.actif, true), isNull(users.deletedAt)),
  });
  const enAttente = await db.query.prospects.findMany({
    where: and(eq(prospects.promoteurId, promoteurId), eq(prospects.statutContact, "NON_CONTACTE")),
  });
  const charges = new Map<string, number>();
  for (const p of enAttente) if (p.commercialId) charges.set(p.commercialId, (charges.get(p.commercialId) ?? 0) + 1);
  return liste
    .map((u) => ({ id: u.id, nom: u.nom, prenom: u.prenom, role: u.role, charge: charges.get(u.id) ?? 0 }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.prenom.localeCompare(b.prenom, "fr"));
}

/** Téléphones (forme canonique) déjà présents chez le promoteur, pour écarter les doublons. */
export async function telephonesConnus(promoteurId: string): Promise<Set<string>> {
  const existants = await db.query.prospects.findMany({ where: eq(prospects.promoteurId, promoteurId) });
  return new Set(existants.map((p) => telephoneCanonique(p.telephone ?? "")).filter((t) => t.length > 0));
}
