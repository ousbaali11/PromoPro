"use client";

import { AnimatePresence, motion } from "motion/react";
import { Badge, type Tone } from "./Primitives";

/**
 * Badge de statut animé : quand `statut` change (ex. Disponible → Vendu), la
 * nouvelle puce glisse à la place de l'ancienne au lieu d'un remplacement brut.
 */
export function StatusBadge({
  statut,
  label,
  tone,
  className,
}: {
  statut: string;
  label: string;
  tone: Tone;
  className?: string;
}) {
  return (
    <span className={className} data-statut={statut}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={statut}
          className="inline-block"
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.6 }}
        >
          <Badge tone={tone} dot>
            {label}
          </Badge>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
