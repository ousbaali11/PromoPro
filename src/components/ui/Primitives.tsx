import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Info as InfoIcon } from "lucide-react";
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

/** Liseré vertical à gauche d'une carte (`accent`) : une couleur sémantique, jamais décorative. */
const accentClasses: Record<Tone, string> = {
  neutral: "before:bg-navy-300",
  success: "before:bg-success",
  warning: "before:bg-warning",
  danger: "before:bg-danger",
  info: "before:bg-info",
  navy: "before:bg-navy",
  gold: "before:bg-gold",
};

export function Card({
  className,
  children,
  elevation = 1,
  interactive = false,
  accent,
  as: Tag = "div",
  ...props
}: {
  className?: string;
  children: ReactNode;
  elevation?: 0 | 1 | 2 | 3;
  interactive?: boolean;
  /** Liseré sémantique à gauche (bien bloqué, désistement, information…). */
  accent?: Tone;
  as?: "div" | "article" | "section" | "li";
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <Tag
      data-card=""
      data-accent={accent}
      className={cn(
        "rounded-lg bg-white ring-1 ring-navy-100/70",
        elevations[elevation],
        interactive &&
          "transition-[transform,box-shadow] duration-normal ease-out-soft hover:-translate-y-0.5 hover:shadow-e3 focus-within:shadow-e3",
        accent && "relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
        accent && accentClasses[accent],
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

/**
 * Section de page : titre de niveau 2 avec compteur facultatif, action à droite,
 * contenu en dessous. Utilisée pour découper les tableaux de bord par rôle.
 */
export function Section({
  title,
  count,
  countTone = "neutral",
  description,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  count?: number;
  countTone?: Tone;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={cn("space-y-3", className)} data-testid={testId}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-h2 text-navy-900">
            {title}
            {count !== undefined && (
              <Badge tone={countTone} className="tabular">
                {count}
              </Badge>
            )}
          </h2>
          {description && <p className="mt-0.5 text-small text-navy-400">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Tuile de chiffre-clé : libellé, valeur, précision, accent facultatif. */
export function Stat({
  label,
  value,
  hint,
  accent = false,
  tone,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden p-5", className)}>
      {icon && (
        <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-300 [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
      )}
      <p className="text-label uppercase text-navy-400">{label}</p>
      <p className={cn("mt-2 text-display tabular", accent ? "text-gold-600" : tone ? toneText[tone] : "text-navy-900")}>{value}</p>
      {hint && <p className="mt-1 text-caption text-navy-400">{hint}</p>}
    </Card>
  );
}

const toneText: Record<Tone, string> = {
  neutral: "text-navy-400",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
  info: "text-info-fg",
  navy: "text-navy-900",
  gold: "text-gold-600",
};

/** Libellé + valeur, pour les fiches (deux colonnes). */
export function Info({ label, value, className }: { label: string; value?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-label uppercase text-navy-400">{label}</p>
      <div className="mt-1 text-body text-navy-900">{value || "—"}</div>
    </div>
  );
}

const calloutIcons: Record<Tone, ReactNode> = {
  neutral: <InfoIcon />,
  info: <InfoIcon />,
  navy: <InfoIcon />,
  gold: <InfoIcon />,
  success: <CheckCircle2 />,
  warning: <AlertTriangle />,
  danger: <AlertCircle />,
};

/**
 * Message contextuel en bloc : erreur de formulaire, avertissement, information.
 * Toujours une icône, une couleur sémantique, jamais de fond décoratif.
 * `role="alert"` automatique pour les tonalités danger (erreurs de soumission).
 */
export function Callout({
  tone = "info",
  title,
  children,
  icon,
  action,
  className,
  role,
  testId,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: string;
  testId?: string;
}) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : undefined)}
      data-testid={testId}
      className={cn(
        "flex items-start gap-2.5 rounded-sm px-3 py-2.5 text-small ring-1 ring-inset",
        toneClasses[tone],
        className,
      )}
    >
      <span className="mt-px shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon ?? calloutIcons[tone]}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type Fil = { label: string; href?: string };

/**
 * Fil d'Ariane des pages de détail : chaque segment est un lien sauf le
 * dernier (page courante, `aria-current="page"`). Toujours dans un <nav>
 * nommé pour les lecteurs d'écran.
 */
export function Breadcrumb({ items, className }: { items: Fil[]; className?: string }) {
  return (
    <nav aria-label="Fil d'Ariane" className={cn("mb-3", className)} data-testid="fil-ariane">
      <ol className="flex flex-wrap items-center gap-1 text-small text-navy-400">
        {items.map((item, i) => {
          const dernier = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-navy-300" aria-hidden />}
              {item.href && !dernier ? (
                <Link
                  href={item.href}
                  className="rounded-xs transition-colors duration-fast hover:text-navy-900 focus-visible:outline-none focus-visible:shadow-focus"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={dernier ? "page" : undefined} className={cn(dernier && "font-medium text-navy-900")}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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
