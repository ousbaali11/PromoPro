"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecalageDansFenetre } from "@/components/ui/recalage";

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  /** Lien de navigation… */
  href?: string;
  /** …ou action. */
  onSelect?: () => void | Promise<unknown>;
  danger?: boolean;
  disabled?: boolean;
  /** Filet de séparation au-dessus de l'entrée */
  separator?: boolean;
};

/**
 * Menu déroulant animé (ouverture en léger ressort depuis le déclencheur),
 * navigable au clavier : flèches, Home/End, Entrée/Espace, Échap ; fermeture
 * au clic extérieur et après sélection. Rôles ARIA menu / menuitem.
 */
export function Dropdown({
  items,
  trigger,
  align = "right",
  label = "Plus d'actions",
  className,
}: {
  items: MenuItem[];
  /** Déclencheur personnalisé ; par défaut, un bouton « ⋯ » */
  trigger?: ReactNode;
  align?: "left" | "right";
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [actif, setActif] = useState(0);
  const racine = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const actifs = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const fermer = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) fermer();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, fermer]);

  useEffect(() => {
    if (!open) return;
    const el = racine.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`);
    el?.focus();
  }, [open, actif]);

  // Le menu reste dans la fenêtre même quand le déclencheur touche un bord (mobile)
  useRecalageDansFenetre(open, racine, menu, align);

  const ouvrir = () => {
    setActif(actifs[0] ?? 0);
    setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        ouvrir();
      }
      return;
    }
    const pos = actifs.indexOf(actif);
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        fermer();
        (racine.current?.querySelector("[data-trigger]") as HTMLElement | null)?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActif(actifs[(pos + 1) % actifs.length]);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActif(actifs[(pos - 1 + actifs.length) % actifs.length]);
        break;
      case "Home":
        e.preventDefault();
        setActif(actifs[0]);
        break;
      case "End":
        e.preventDefault();
        setActif(actifs[actifs.length - 1]);
        break;
      case "Tab":
        fermer();
        break;
    }
  };

  const selectionner = async (it: MenuItem) => {
    if (it.disabled) return;
    fermer();
    // Le focus revient au déclencheur avant l action : une modale ouverte
    // depuis le menu mémorise ainsi un élément encore présent pour le rendre à sa fermeture.
    (racine.current?.querySelector("[data-trigger]") as HTMLElement | null)?.focus();
    await it.onSelect?.();
  };

  return (
    <div ref={racine} className={cn("relative inline-block", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        data-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={trigger ? undefined : label}
        onClick={() => (open ? fermer() : ouvrir())}
        className={cn(
          !trigger &&
            "flex h-8 w-8 items-center justify-center rounded-sm text-navy-400 transition-colors duration-fast hover:bg-navy-50 hover:text-navy focus-visible:outline-none focus-visible:shadow-focus",
          open && !trigger && "bg-navy-50 text-navy",
        )}
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, scale: 0.94, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -2, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 520, damping: 32, mass: 0.6 }}
            style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
            className={cn(
              "absolute z-30 mt-1.5 min-w-44 overflow-hidden rounded-md bg-white p-1 shadow-e4 ring-1 ring-navy-100/70",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {items.map((it, i) => {
              const classes = cn(
                "flex w-full items-center gap-2.5 rounded-xs px-2.5 py-2 text-left text-small transition-colors duration-fast",
                "focus:outline-none focus:bg-navy-50",
                it.danger ? "text-danger-fg hover:bg-danger-bg focus:bg-danger-bg" : "text-navy-900 hover:bg-navy-50",
                it.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-navy-400",
                it.danger && "[&_svg]:text-danger",
              );
              const contenu = (
                <>
                  {it.icon}
                  {it.label}
                </>
              );
              return (
                <div key={it.label} className={cn(it.separator && "mt-1 border-t border-navy-50 pt-1")}>
                  {it.href && !it.disabled ? (
                    <Link
                      href={it.href}
                      role="menuitem"
                      data-index={i}
                      tabIndex={actif === i ? 0 : -1}
                      className={classes}
                      onClick={fermer}
                      onMouseEnter={() => setActif(i)}
                    >
                      {contenu}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      data-index={i}
                      tabIndex={actif === i ? 0 : -1}
                      disabled={it.disabled}
                      aria-disabled={it.disabled}
                      className={classes}
                      onClick={() => selectionner(it)}
                      onMouseEnter={() => !it.disabled && setActif(i)}
                    >
                      {contenu}
                    </button>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
