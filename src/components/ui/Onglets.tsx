"use client";

import Link from "next/link";
import { useId, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type Onglet = {
  value: string;
  label: string;
  /** Navigation (onglet porté par l'URL) : rendu en lien. Sinon, bouton + `onChange`. */
  href?: string;
  count?: number;
};

/**
 * Onglets soulignés : un trait doré glisse d'un onglet à l'autre (layoutId),
 * même motif que la navigation de l'espace client. À utiliser pour les
 * sections d'une même page (fiche client, espace client) ; le contrôle
 * segmenté (pastille navy) reste réservé aux filtres et bascules de vue.
 *
 * Clavier : flèches et Home / End déplacent le focus, Entrée ou Espace
 * activent (y compris pour les liens). La liste défile horizontalement sur
 * petit écran au lieu de déborder.
 */
export function Onglets({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  testId,
}: {
  items: Onglet[];
  value: string;
  onChange?: (value: string) => void;
  ariaLabel: string;
  className?: string;
  testId?: string;
}) {
  const id = useId();
  const parLien = items.every((i) => i.href !== undefined);
  const Conteneur = parLien ? "nav" : "div";

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const onglets = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-onglet]")];
    const pos = onglets.indexOf(document.activeElement as HTMLElement);
    if (pos < 0 || onglets.length === 0) return;
    let cible = -1;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        cible = (pos + 1) % onglets.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        cible = (pos - 1 + onglets.length) % onglets.length;
        break;
      case "Home":
        cible = 0;
        break;
      case "End":
        cible = onglets.length - 1;
        break;
      case " ":
        if (onglets[pos].tagName === "A") {
          e.preventDefault();
          onglets[pos].click();
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    onglets[cible].focus();
  };

  return (
    <Conteneur
      aria-label={ariaLabel}
      role={parLien ? undefined : "tablist"}
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={cn("flex gap-1 overflow-x-auto border-b border-navy-100/80", className)}
    >
      {items.map((item) => {
        const actif = item.value === value;
        const classes = cn(
          "relative shrink-0 whitespace-nowrap px-3 py-3 text-small transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus",
          actif ? "font-medium text-navy-900" : "text-navy-400 hover:text-navy-900",
        );
        const contenu = (
          <>
            {item.label}
            {item.count !== undefined && (
              <span className={cn("ml-1.5 rounded-full px-1.5 text-caption tabular", actif ? "bg-gold-50 text-gold-700" : "bg-navy-50 text-navy-400")}>{item.count}</span>
            )}
            {actif && (
              <motion.span
                layoutId={`onglet-${id}`}
                className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold"
                transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.7 }}
                data-testid="onglet-indicateur"
              />
            )}
          </>
        );
        if (parLien) {
          return (
            <Link key={item.value} href={item.href!} data-onglet aria-current={actif ? "page" : undefined} className={classes}>
              {contenu}
            </Link>
          );
        }
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            data-onglet
            aria-selected={actif}
            tabIndex={actif ? 0 : -1}
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
