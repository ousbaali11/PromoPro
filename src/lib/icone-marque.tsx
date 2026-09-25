import { ImageResponse } from "next/og";

/*
 * Icône de la marque PromoPro générée par code (PNG) : même visuel que
 * src/app/icon.svg, la barre latérale et la page de connexion — carré doré
 * arrondi, pictogramme Building2 (lucide) blanc à la moitié de la taille.
 * Sert à l'icône iOS (apple-icon) et à l'icône par défaut des espaces dont le
 * promoteur n'a pas de logo.
 */

export const OR = "#b08d57";

/** Tracés du pictogramme Building2 de lucide (viewBox 0 0 24 24). */
export const TRACES_BUILDING2 = [
  "M10 12h4",
  "M10 8h4",
  "M14 21v-3a2 2 0 0 0-4 0v3",
  "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
  "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
];

export function IconeMarque({ taille, rayon }: { taille: number; rayon: number }) {
  const glyphe = taille / 2;
  return (
    <div
      style={{
        width: taille,
        height: taille,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: OR,
        borderRadius: rayon,
      }}
    >
      <svg
        width={glyphe}
        height={glyphe}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {TRACES_BUILDING2.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>
  );
}

/** Image PNG de l'icône de la marque, aux dimensions demandées. */
export function imageIconeMarque(taille: number, rayon: number, headers?: Record<string, string>) {
  return new ImageResponse(<IconeMarque taille={taille} rayon={rayon} />, { width: taille, height: taille, headers });
}
