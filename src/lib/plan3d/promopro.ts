import { saveUpload } from "@/lib/storage";
import { ErreurFournisseur, type Demarrage, type FournisseurPlan3d, type ImagePlan, type StatutGeneration } from "./provider";
import { grisDuPlan, MESSAGE_MODELE_ABSENT, modeleDisponible, segmenterPlan } from "./inference";
import { ajouterEncre, extraireStructure } from "./segmentation";
import { dimensionsParDefaut, extruderEnGlb } from "./extrusion";

/*
 * Adaptateur « Solution PromoPro » : modèle interne (U-Net ResNet-34 en ONNX,
 * voir IA-INTERNE.md) exécuté sur le serveur. Synchrone : segmentation du
 * plan (murs, portes, fenêtres) complétée par les traits sombres de l'image
 * (murs fins, fenêtres), extraction des pièces, extrusion en .glb,
 * enregistrement comme fichier plans-3d de l'application — le tout en
 * quelques secondes sur CPU. Aucune clé, aucun service tiers. Sans modèle
 * installé, la génération échoue avec un message explicite.
 */

export const promopro: FournisseurPlan3d = {
  code: "PROMOPRO",

  async demarrerGeneration(image: ImagePlan): Promise<Demarrage> {
    if (!(await modeleDisponible())) throw new ErreurFournisseur(MESSAGE_MODELE_ABSENT);
    const masque = await segmenterPlan(image.octets);
    ajouterEncre(masque, await grisDuPlan(image.octets, masque.largeur, masque.hauteur));
    const { pieces, portes } = extraireStructure(masque);
    if (pieces.length === 0) throw new ErreurFournisseur("Solution PromoPro : aucune pièce reconnue sur ce plan (murs non détectés).");
    const { largeurM, hauteurM } = dimensionsParDefaut(masque.largeur, masque.hauteur);
    const glb = extruderEnGlb(pieces, portes, largeurM, hauteurM);
    const modelUrl = await saveUpload("plans-3d", "modele.glb", glb);
    return { etat: "pret", modelUrl };
  },

  async verifierStatut(): Promise<StatutGeneration> {
    // La génération est synchrone : il n'y a jamais de tâche à suivre
    return { etat: "echec", message: "Solution PromoPro : aucune génération en attente à vérifier." };
  },
};
