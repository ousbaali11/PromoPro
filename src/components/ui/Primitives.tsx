import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Champs (client) ré-exportés ici pour conserver l'import historique `@/components/ui/Primitives`.
export { Input, Select, Textarea } from "./Fields";
export type { InputProps, SelectProps, TextareaProps } from "./Fields";

/*
 * Surfaces. L'élévation dit ce que la carte « est » :
 * 0 : zone délimitée (fond + filet), ne flotte pas
 * 1 : carte au repos (défaut)
 * 2 : carte mise en avant / survolée
 * 3 : panneau flottant (popover)
 * `interactive` ajoute la montée au survol (translation + ombre e3).
 */
const elevations = ["shadow-none", "shadow-e2", "shadow-e3", "shadow-e4"] as const;

export function Card({
  className,
  children,
  elevation = 1,
  interactive = false,
  as: Tag = "div",
  ...props
}: {
  className?: string;
  children: ReactNode;
  elevation?: 0 | 1 | 2 | 3;
  interactive?: boolean;
  as?: "div" | "article" | "section" | "li";
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <Tag
      data-card=""
      className={cn(
        "rounded-lg bg-white ring-1 ring-navy-100/70",
        elevations[elevation],
        interactive &&
          "transition-[transform,box-shadow] duration-normal ease-out-soft hover:-translate-y-0.5 hover:shadow-e3 focus-within:shadow-e3",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "navy" | "gold";

export const toneClasses: Record<Tone, string> = {
  neutral: "bg-navy-50 text-navy-400 ring-navy-100",
  success: "bg-success-bg text-success-fg ring-success-border",
  warning: "bg-warning-bg text-warning-fg ring-warning-border",
  danger: "bg-danger-bg text-danger-fg ring-danger-border",
  info: "bg-info-bg text-info-fg ring-info-border",
  navy: "bg-navy/10 text-navy ring-navy/20",
  gold: "bg-gold-50 text-gold-700 ring-gold-200",
};

/** Puce de statut. `tone` fixe la couleur ; `className` reste accepté (anciens appels). */
export function Badge({
  children,
  className,
  tone,
  dot = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-medium ring-1 ring-inset",
        "transition-[background-color,color,box-shadow] duration-normal ease-linear",
        tone ? toneClasses[tone] : !className && toneClasses.neutral,
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Sur-titre discret (ex. nom du projet) */
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-label uppercase text-gold-600">{eyebrow}</p>}
        <h1 className="text-h1 text-navy-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-small text-navy-400">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * État vide : une illustration légère (cercle + icône), un titre, une phrase
 * qui dit quoi faire, et une action facultative.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-navy-100 bg-white/60 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-navy-50 text-navy-300 ring-8 ring-navy-50/60 [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <p className="text-h3 text-navy-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-small text-navy-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Label statique au-dessus d'un champ nu (mode historique, toujours supporté). */
export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-small font-medium text-navy-900">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-caption text-navy-400">{hint}</span>}
    </label>
  );
}
