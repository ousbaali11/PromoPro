"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
export type Size = "sm" | "md" | "lg";

/*
 * Variantes : chaque état (hover, active, focus-visible, disabled) est écrit.
 * - hover : légère montée de luminosité + ombre e2 pour les boutons pleins
 * - active : retour à plat (ombre retirée) + pression 0.98
 * - focus-visible : anneau doré (token --shadow-focus), jamais l'outline bleu
 * - disabled : opacité, curseur, et plus aucun effet de survol
 */
const variants: Record<Variant, string> = {
  primary:
    "bg-navy text-white shadow-e1 hover:bg-navy-600 hover:shadow-e2 active:bg-navy-900 active:shadow-none disabled:hover:bg-navy disabled:hover:shadow-e1",
  secondary:
    "bg-white text-navy ring-1 ring-inset ring-navy-100 shadow-e1 hover:bg-navy-50 hover:ring-navy-200 active:bg-navy-100 active:shadow-none disabled:hover:bg-white",
  ghost: "text-navy hover:bg-navy-50 active:bg-navy-100 disabled:hover:bg-transparent",
  danger:
    "bg-danger text-white shadow-e1 hover:bg-danger-fg hover:shadow-e2 active:shadow-none disabled:hover:bg-danger",
  gold: "bg-gold text-white shadow-e1 hover:bg-gold-600 hover:shadow-e2 active:bg-gold-700 active:shadow-none disabled:hover:bg-gold",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-small gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5",
  md: "h-10 px-4 text-body gap-2 [&_svg]:h-4 [&_svg]:w-4",
  lg: "h-12 px-5 text-body gap-2.5 [&_svg]:h-[18px] [&_svg]:w-[18px]",
};

export const buttonBase =
  "relative inline-flex select-none items-center justify-center rounded-sm font-medium whitespace-nowrap " +
  "transition-[background-color,box-shadow,transform,color] duration-fast ease-linear " +
  "focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Remplace le contenu par un spinner sans changer la largeur du bouton. */
  loading?: boolean;
  /** Icône avant le libellé (dimensionnée automatiquement). */
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonBase, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {/* Le contenu reste dans le flux (invisible) pour conserver la largeur */}
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>
        {icon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <Loader2 className="animate-spin" />
        </span>
      )}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  icon,
  children,
  ...props
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  icon?: ReactNode;
  children: ReactNode;
  prefetch?: boolean;
  target?: string;
}) {
  return (
    <Link href={href} className={cn(buttonBase, variants[variant], sizes[size], className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}

/**
 * Action destructive à deux temps, sans `confirm()` navigateur : le premier
 * clic arme le bouton (« Confirmer ? », teinte danger) pendant `delai` ms ;
 * un second clic dans ce laps de temps exécute `onConfirm`, sinon le bouton
 * revient à son état initial. `onConfirm` peut être asynchrone : le bouton
 * passe alors en état loading.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel = "Confirmer ?",
  delai = 3000,
  variant = "danger",
  size = "md",
  className,
  icon,
  children,
  disabled,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  onConfirm: () => void | Promise<unknown>;
  confirmLabel?: ReactNode;
  delai?: number;
}) {
  const [arme, setArme] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const desarmer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArme(false);
  };

  const onClick = async () => {
    if (loading) return;
    if (!arme) {
      setArme(true);
      timer.current = setTimeout(() => setArme(false), delai);
      return;
    }
    desarmer();
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={cn(
        buttonBase,
        arme ? variants.danger : variants[variant],
        sizes[size],
        arme && "ring-2 ring-danger-border ring-offset-1",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-live="polite"
      data-armed={arme || undefined}
      onClick={onClick}
      onBlur={() => arme && desarmer()}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>
        <AnimatePresence mode="wait" initial={false}>
          {arme ? (
            <motion.span
              key="arme"
              className="inline-flex items-center gap-[inherit]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <ShieldAlert />
              {confirmLabel}
            </motion.span>
          ) : (
            <motion.span
              key="repos"
              className="inline-flex items-center gap-[inherit]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              {icon}
              {children}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <Loader2 className="animate-spin" />
        </span>
      )}
    </button>
  );
}
