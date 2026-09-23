"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modale : fond flouté, entrée en léger scale + fondu (courbe ressort), piège
 * de focus (Tab / Shift+Tab bouclent à l'intérieur), fermeture à Échap et au
 * clic sur le voile. Rendue dans un portail sur <body>.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titreId = useId();
  const descId = useId();
  const panneau = useRef<HTMLDivElement>(null);
  const contenu = useRef<HTMLDivElement>(null);
  const precedent = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    precedent.current = document.activeElement;
    const el = panneau.current;
    // Focus initial : premier élément focalisable du contenu (champ, lien), sinon
    // du pied (boutons d'action), sinon la croix de fermeture, sinon le panneau
    const premier =
      contenu.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      el?.querySelector<HTMLElement>("[data-modal-footer] " + FOCUSABLE.split(", ").join(", [data-modal-footer] ")) ??
      el?.querySelector<HTMLElement>(FOCUSABLE);
    (premier ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const focusables = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (precedent.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "linear" }}
        >
          {/* Voile flouté */}
          <div className="absolute inset-0 bg-navy-900/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            ref={panneau}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titreId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cn(
              "relative w-full rounded-xl bg-white shadow-e5 ring-1 ring-navy-100/70 focus:outline-none",
              { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size],
            )}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-5">
              <div className="min-w-0">
                <h2 id={titreId} className="text-h2 text-navy-900">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-small text-navy-400">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="-mr-2 -mt-1 rounded-sm p-2 text-navy-300 transition-colors duration-fast hover:bg-navy-50 hover:text-navy"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div ref={contenu} className="px-6 py-5">
              {children}
            </div>
            {footer && (
              <div data-modal-footer className="flex flex-wrap justify-end gap-2 border-t border-navy-50 px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
