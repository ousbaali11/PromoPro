import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { promoteurs } from "@/db/schema";

export type Promoteur = typeof promoteurs.$inferSelect;

/**
 * Charge le promoteur d'un projet ou d'une session. Chaque document généré
 * (contrat, reçu, autorisation de visite) et l'espace client affichent SON
 * nom : un promoteur absent est une incohérence de données (clé étrangère),
 * jamais l'occasion d'afficher un nom générique ou celui de la plateforme.
 */
export async function chargerPromoteur(id: string): Promise<Promoteur> {
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, id) });
  if (!promoteur) throw new Error(`Promoteur introuvable (${id}).`);
  return promoteur;
}
