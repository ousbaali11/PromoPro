/*
 * Rendu 3D en images (fournisseur « Gemini — rendu 3D ») : plusieurs vues de
 * la même maquette, assemblées côte à côte dans une seule image (une
 * « planche »), que la visionneuse tournante (RenduTournant) fait défiler
 * au glisser. Règles partagées entre le serveur (assemblage) et le navigateur
 * (découpage) : aucun import Node ici.
 */

/** Nombre de vues générées par plan : dessus en perspective, puis tournée de 90°, 180° et 270°. */
export const NB_VUES = 4;
/** Dimensions d'une vue dans la planche (4:3). */
export const LARGEUR_VUE = 1200;
export const HAUTEUR_VUE = 900;

/** Nombre de vues d'une planche d'après ses dimensions (chaque vue est au format 4:3). */
export function nombreDeVues(largeur: number, hauteur: number): number {
  if (!largeur || !hauteur) return 1;
  return Math.max(1, Math.round(largeur / hauteur / (LARGEUR_VUE / HAUTEUR_VUE)));
}

/** Vrai si l'adresse d'un résultat 3D est une planche d'images (et non un modèle .glb / .gltf). */
export function estRenduImage(url: string): boolean {
  return /\.(jpe?g|png)(\?|$)/i.test(url);
}

/** Angle, dans le sens horaire, de la vue d'indice `i` (0 → 0°). */
export function angleDeLaVue(i: number, nb = NB_VUES): number {
  return Math.round((360 * (((i % nb) + nb) % nb)) / nb);
}
