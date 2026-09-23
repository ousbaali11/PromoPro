"use client";

import { useSyncExternalStore } from "react";

const rien = () => () => {};

/**
 * `false` pendant le rendu serveur et l'hydratation, `true` ensuite. Sert à
 * poser un marqueur `data-hydrated` sur les formulaires que les tests
 * manipulent par script (injecter une option, forcer une valeur) : avant
 * l'hydratation, React remplacerait ces changements en régénérant l'arbre.
 */
export function useHydrated() {
  return useSyncExternalStore(
    rien,
    () => true,
    () => false,
  );
}
