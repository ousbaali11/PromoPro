"use client";

import Link from "next/link";
import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type Segment = {
  value: string;
  label: string;
  /** Navigation (filtre par URL) : rendu en lien. Sinon, bouton + `onChange`. */
  href?: string;
  count?: number;
};

/**
 * Contrôle segmenté : une pastille navy glisse d'un segment à l'autre
 * (layoutId) au lieu d'un changement de couleur brut. Utilisé pour les
 * filtres de période (liens) et les bascules de vue (boutons).
 */
export function SegmentedControl({
  items,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className,
  testId,
}: {
  items: Segment[];
  value: string;
  onChange?: (value: string) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
  testId?: string;
}) {
  const id = useId();
  const parLien = items.every((i) => i.href !== undefined);
  const Conteneur = parLien ? "nav" : "div";
  const taille = size === "sm" ? "h-7 px-2.5 text-caption" : "h-8 px-3 text-small";

  return (
    <Conteneur
      aria-label={ariaLabel}
      role={parLien ? undefined : "tablist"}
      data-testid={testId}
      className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-full bg-navy-50 p-1 ring-1 ring-inset ring-navy-100/70", className)}
    >
      {items.map((item) => {
        const actif = item.value === value;
        const classes = cn(
          "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-fast ease-linear",
          "focus-visible:outline-none focus-visible:shadow-focus",
          taille,
          actif ? "text-white" : "text-navy-600 hover:text-navy-900",
        );
        const contenu = (
          <>
            {actif && (
              <motion.span
                layoutId={`segment-${id}`}
                className="absolute inset-0 rounded-full bg-navy shadow-e1"
                transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.7 }}
              />
            )}
            <span className="relative">{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  "relative rounded-full px-1.5 text-[11px] tabular",
                  actif ? "bg-white/15 text-white" : "bg-navy-100/70 text-navy-600",
                )}
              >
                {item.count}
              </span>
            )}
          </>
        );
        return parLien ? (
          <Link key={item.value} href={item.href!} aria-current={actif ? "page" : undefined} className={classes}>
            {contenu}
          </Link>
        ) : (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={actif}
            onClick={() => onChange?.(item.value)}
            className={classes}
          >
            {contenu}
          </button>
        );
      })}
    </Conteneur>
  );
}
