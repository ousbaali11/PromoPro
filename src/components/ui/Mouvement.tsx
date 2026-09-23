"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Respect global de `prefers-reduced-motion` pour motion/react : quand
 * l'utilisateur le demande, les animations de transformation et de layout
 * (glissements, ressorts, changements de vue) deviennent instantanées ; seuls
 * les fondus d'opacité subsistent. Les transitions CSS sont neutralisées de
 * leur côté par la règle @media de globals.css.
 */
export function Mouvement({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
