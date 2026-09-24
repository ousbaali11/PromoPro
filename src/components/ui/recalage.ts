"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Recale un panneau flottant (menu déroulant, sélecteur de plage, panneau
 * d'import) dans la fenêtre : positionné en absolu contre son déclencheur
 * (`right-0` ou `left-0`), il en sortirait sur un petit écran quand le
 * déclencheur est près du bord opposé. Le décalage est calculé depuis le
 * rectangle du déclencheur et la largeur réelle du panneau (offsetWidth,
 * insensible à l'animation d'échelle) puis appliqué directement au nœud —
 * aucun rendu supplémentaire, aucun état.
 */
export function useRecalageDansFenetre(
  ouvert: boolean,
  ancreRef: RefObject<HTMLElement | null>,
  panneauRef: RefObject<HTMLElement | null>,
  align: "left" | "right" = "right",
  marge = 8,
) {
  useLayoutEffect(() => {
    if (!ouvert || !ancreRef.current || !panneauRef.current) return;
    const rect = ancreRef.current.getBoundingClientRect();
    const largeur = panneauRef.current.offsetWidth;
    const fenetre = window.innerWidth;
    if (align === "right") {
      const gauche = rect.right - largeur;
      panneauRef.current.style.right = gauche < marge ? `${gauche - marge}px` : "";
    } else {
      const droite = rect.left + largeur;
      panneauRef.current.style.left = droite > fenetre - marge ? `${fenetre - marge - droite}px` : "";
    }
  }, [ouvert, ancreRef, panneauRef, align, marge]);
}
