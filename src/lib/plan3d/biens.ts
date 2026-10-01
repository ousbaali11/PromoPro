import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, generationsPlan3d, projets } from "@/db/schema";
import { notifyRole } from "@/lib/notifications";
import { enregistrerActivite } from "@/lib/journal";
import type { SessionPayload } from "@/lib/auth";
import { cleApiPour, fournisseurActif } from "./config";
import { executerGeneration, generationAutorisee, imageDuPlan, reprendreGeneration, type ResultatGeneration } from "./generation";
import { libelleFournisseur, type Fournisseur } from "./provider";

/*
 * Générations de modèles 3D sur les biens (Volet B). Une ligne par tentative
 * dans generations_plan3d ; le modèle n'atteint biens.plan_3d_url (visible du
 * client) qu'à la validation du Directeur Commercial. Sans fournisseur actif,
 * rien ne se déclenche : le dépôt manuel fonctionne comme avant.
 */

export type Generation = typeof generationsPlan3d.$inferSelect;

export async function generationsDuBien(bienId: string): Promise<Generation[]> {
  return db.query.generationsPlan3d.findMany({ where: eq(generationsPlan3d.bienId, bienId), orderBy: [desc(generationsPlan3d.createdAt)] });
}

export type Declenchement = { declenchee: true; id: string } | { declenchee: false; motif: "aucun-fournisseur" | "modele-manuel" | "fenetre-24h" };

/**
 * À appeler après l'enregistrement d'un plan 2D. Crée la génération et rend
 * une fonction à exécuter en arrière-plan (après la réponse) ; ne lève jamais.
 */
export async function preparerGenerationPourBien(bienId: string, planUrl: string, aUnModele3d: boolean): Promise<{ resultat: Declenchement; executer?: () => Promise<void> }> {
  if (aUnModele3d) return { resultat: { declenchee: false, motif: "modele-manuel" } };
  const actif = await fournisseurActif();
  if (!actif) return { resultat: { declenchee: false, motif: "aucun-fournisseur" } };
  const derniere = await db.query.generationsPlan3d.findFirst({ where: eq(generationsPlan3d.bienId, bienId), orderBy: [desc(generationsPlan3d.createdAt)] });
  if (derniere && !generationAutorisee(derniere.createdAt)) return { resultat: { declenchee: false, motif: "fenetre-24h" } };
  const [generation] = await db.insert(generationsPlan3d).values({ bienId, fournisseur: actif.fournisseur, statut: "EN_ATTENTE" }).returning();
  return {
    resultat: { declenchee: true, id: generation.id },
    executer: async () => {
      const lecture = await imageDuPlan(planUrl);
      if ("erreur" in lecture) return terminer(generation.id, { etat: "echec", message: lecture.erreur, dureeMs: 0 });
      const resultat = await executerGeneration(actif.fournisseur, actif.cleApi, lecture.image, async (reference) => {
        await db.update(generationsPlan3d).set({ referenceFournisseur: reference }).where(eq(generationsPlan3d.id, generation.id));
      });
      await terminer(generation.id, resultat);
    },
  };
}

async function terminer(id: string, resultat: ResultatGeneration) {
  const generation = await db.query.generationsPlan3d.findFirst({ where: eq(generationsPlan3d.id, id) });
  if (!generation || generation.statut !== "EN_ATTENTE") return;
  await db
    .update(generationsPlan3d)
    .set(resultat.etat === "pret" ? { statut: "PRET", modelUrl: resultat.modelUrl, erreurMessage: null } : { statut: "ECHEC", erreurMessage: resultat.message })
    .where(eq(generationsPlan3d.id, id));
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, generation.bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet) return;
  const fournisseur = libelleFournisseur(generation.fournisseur);
  await notifyRole(projet.promoteurId, "DIRECTEUR_COMMERCIAL", {
    type: resultat.etat === "pret" ? "PLAN3D_PRET" : "PLAN3D_ECHEC",
    titre: resultat.etat === "pret" ? "Modèle 3D généré, à valider" : "Génération du modèle 3D impossible",
    message: resultat.etat === "pret" ? `${bien.designation} · ${fournisseur} — à vérifier avant publication` : `${bien.designation} · ${fournisseur} : ${resultat.message}`,
    lien: `/dashboard/biens/${bien.id}`,
  });
}

/** Générations encore en attente d'un bien : vérifiées auprès du fournisseur (reprise après redémarrage). */
export async function rattraperGenerations(bienId: string) {
  const enAttente = (await generationsDuBien(bienId)).filter((g) => g.statut === "EN_ATTENTE" && g.referenceFournisseur && g.createdAt);
  for (const g of enAttente) {
    const cleApi = await cleApiPour(g.fournisseur as Fournisseur);
    if (cleApi === null) continue;
    const resultat = await reprendreGeneration(g.fournisseur as Fournisseur, cleApi, g.referenceFournisseur!, g.createdAt!);
    if (resultat) await terminer(g.id, resultat);
  }
}

/** Le Directeur Commercial publie un modèle généré : copie vers biens.plan_3d_url, visible du client dès lors. */
export async function validerGeneration(session: SessionPayload, generationId: string): Promise<{ ok: true; bienId: string } | { error: string }> {
  const generation = await db.query.generationsPlan3d.findFirst({ where: eq(generationsPlan3d.id, generationId) });
  if (!generation) return { error: "Génération introuvable." };
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, generation.bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== session.promoteurId) return { error: "Génération introuvable." };
  if (generation.statut !== "PRET" || !generation.modelUrl) return { error: "Ce modèle n'est pas prêt : il ne peut pas être publié." };
  const maintenant = new Date();
  await db.update(biens).set({ plan3dUrl: generation.modelUrl }).where(eq(biens.id, bien.id));
  await db.update(generationsPlan3d).set({ valideAt: maintenant, valideParId: session.userId }).where(eq(generationsPlan3d.id, generationId));
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "bien",
    cibleId: bien.id,
    cibleNom: bien.designation,
    details: `Modèle 3D généré par ${libelleFournisseur(generation.fournisseur)} validé et publié dans l'espace client`,
  });
  return { ok: true, bienId: bien.id };
}
