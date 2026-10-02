"use client";

import { ModelViewer } from "./ModelViewer";
import { RenduTournant } from "./RenduTournant";
import { estRenduImage } from "@/lib/plan3d/rendu-vues";

/**
 * Aperçu d'un résultat 3D quelle que soit sa forme : modèle .glb / .gltf
 * (visualiseur <model-viewer>, rotation libre) ou planche d'images d'un rendu
 * (visionneuse tournante). Utilisé par le bac à sable, la fiche du bien et
 * l'espace client.
 */
export function Apercu3d({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return estRenduImage(src) ? <RenduTournant src={src} alt={alt} className={className} /> : <ModelViewer src={src} alt={alt} className={className} />;
}
