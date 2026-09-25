import { imageIconeMarque } from "@/lib/icone-marque";

/*
 * Icône de l'écran d'accueil iOS (180 × 180). iOS arrondit lui-même les
 * coins : fond doré plein bord, pictogramme centré.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return imageIconeMarque(180, 0);
}
