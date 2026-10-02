import { saveUpload } from "@/lib/storage";
import { ErreurFournisseur, type Demarrage, type Fournisseur, type FournisseurPlan3d, type ImagePlan, type StatutGeneration, type VarianteModele } from "./provider";
import { grisDuPlan, messageModeleAbsent, modeleDisponible, segmenterPlan, VARIANTES } from "./inference";
import { ajouterEncre, extraireStructure } from "./segmentation";
import { dimensionsParDefaut, extruderEnGlb } from "./extrusion";

/*
 * Adaptateurs internes : un modèle ONNX (U-Net ResNet-34, voir IA-INTERNE.md)
 * exécuté sur le serveur. Synchrone : segmentation du plan (murs, portes,
 * fenêtres) complétée par les traits sombres de l'image (murs fins,
 * fenêtres), extraction des pièces, extrusion en .glb, enregistrement comme
 * fichier plans-3d de l'application — le tout en quelques secondes sur CPU.
 * Aucune clé, aucun service tiers. Sans modèle installé, la génération échoue
 * avec un message explicite. La fabrique permet d'exposer une autre variante
 * du modèle (autre fichier, même chaîne) sans rien dupliquer.
 */

function fournisseurInterne(code: Fournisseur, variante: VarianteModele): FournisseurPlan3d {
  const { libelle } = VARIANTES[variante];
  return {
    code,

    async demarrerGeneration(image: ImagePlan): Promise<Demarrage> {
      if (!(await modeleDisponible(variante))) throw new ErreurFournisseur(messageModeleAbsent(variante));
      const masque = await segmenterPlan(image.octets, variante);
      ajouterEncre(masque, await grisDuPlan(image.octets, masque.largeur, masque.hauteur));
      const { pieces, portes } = extraireStructure(masque);
      if (pieces.length === 0) throw new ErreurFournisseur(`${libelle} : aucune pièce reconnue sur ce plan (murs non détectés).`);
      const { largeurM, hauteurM } = dimensionsParDefaut(masque.largeur, masque.hauteur);
      const glb = extruderEnGlb(pieces, portes, largeurM, hauteurM);
      const modelUrl = await saveUpload("plans-3d", "modele.glb", glb);
      return { etat: "pret", modelUrl };
    },

    async verifierStatut(): Promise<StatutGeneration> {
      // La génération est synchrone : il n'y a jamais de tâche à suivre
      return { etat: "echec", message: `${libelle} : aucune génération en attente à vérifier.` };
    },
  };
}

export const promopro = fournisseurInterne("PROMOPRO", "principal");
