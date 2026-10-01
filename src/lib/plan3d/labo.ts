import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { essaisPlan3dLabo } from "@/db/schema";
import { cleApiPour } from "./config";
import { executerGeneration, imageDuPlan, reprendreGeneration, type ResultatGeneration } from "./generation";
import type { Fournisseur } from "./provider";

/*
 * Bac à sable du Super Admin : un essai par (fournisseur, plan), jamais
 * rattaché à un bien ni visible ailleurs. Les fichiers (plan déposé, modèle
 * rendu) ne sont référencés que par cette table : seul le Super Admin, qui
 * lit tous les fichiers, peut les ouvrir.
 */

export async function creerEssai(fournisseur: Fournisseur, planUrl: string) {
  const [essai] = await db.insert(essaisPlan3dLabo).values({ fournisseur, planUrl, statut: "EN_ATTENTE" }).returning();
  return essai;
}

async function terminerEssai(id: string, resultat: ResultatGeneration) {
  await db
    .update(essaisPlan3dLabo)
    .set(
      resultat.etat === "pret"
        ? { statut: "PRET", resultatUrl: resultat.modelUrl, dureeMs: resultat.dureeMs, erreurMessage: null }
        : { statut: "ECHEC", erreurMessage: resultat.message, dureeMs: resultat.dureeMs },
    )
    .where(eq(essaisPlan3dLabo.id, id));
}

/** Exécute l'essai (à lancer en arrière-plan). */
export async function executerEssai(id: string) {
  const essai = await db.query.essaisPlan3dLabo.findFirst({ where: eq(essaisPlan3dLabo.id, id) });
  if (!essai || essai.statut !== "EN_ATTENTE") return;
  const fournisseur = essai.fournisseur as Fournisseur;
  const cleApi = await cleApiPour(fournisseur); // chaîne vide pour un fournisseur sans clé (modèle interne), null si inutilisable
  if (cleApi === null) return terminerEssai(id, { etat: "echec", message: "Fournisseur inutilisable : aucune clé d'API enregistrée, ou modèle non installé.", dureeMs: 0 });
  const lecture = await imageDuPlan(essai.planUrl);
  if ("erreur" in lecture) return terminerEssai(id, { etat: "echec", message: lecture.erreur, dureeMs: 0 });
  const resultat = await executerGeneration(fournisseur, cleApi, lecture.image, async (reference) => {
    await db.update(essaisPlan3dLabo).set({ referenceFournisseur: reference }).where(eq(essaisPlan3dLabo.id, id));
  });
  await terminerEssai(id, resultat);
}

/** Essais encore en attente : vérifiés auprès du fournisseur (reprise après redémarrage), terminés si le résultat est connu. */
export async function rattraperEssais() {
  const enAttente = await db.query.essaisPlan3dLabo.findMany({ where: eq(essaisPlan3dLabo.statut, "EN_ATTENTE") });
  for (const essai of enAttente) {
    if (!essai.referenceFournisseur || !essai.createdAt) continue;
    const cleApi = await cleApiPour(essai.fournisseur as Fournisseur);
    if (cleApi === null) continue;
    const resultat = await reprendreGeneration(essai.fournisseur as Fournisseur, cleApi, essai.referenceFournisseur, essai.createdAt);
    if (resultat) await terminerEssai(essai.id, resultat);
  }
}

export async function listerEssais(limite = 50) {
  return db.query.essaisPlan3dLabo.findMany({ orderBy: [desc(essaisPlan3dLabo.createdAt)], limit: limite });
}
