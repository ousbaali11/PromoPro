import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatMoney(amount: number, devise = "MAD") {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " " + devise;
}

export function formatDate(date: Date | number | string | null | undefined) {
  if (!date) return "—";
  const d = new Date(date);
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(date: Date | number | string | null | undefined) {
  if (!date) return "—";
  const d = new Date(date);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Délai minimum entre deux demandes de photos d'avancement d'un même bien (section 11.3). */
export const DELAI_PHOTOS_MOIS = 6;

/** Échéancier par défaut : 40% le jour du blocage, puis 20% tous les 6 mois (x3). */
export function defaultEcheancier(prix: number, dateBlocage: Date) {
  return [
    { numero: 1, pourcentage: 40, montant: Math.round(prix * 0.4), dateEcheance: dateBlocage },
    { numero: 2, pourcentage: 20, montant: Math.round(prix * 0.2), dateEcheance: addMonths(dateBlocage, 6) },
    { numero: 3, pourcentage: 20, montant: Math.round(prix * 0.2), dateEcheance: addMonths(dateBlocage, 12) },
    { numero: 4, pourcentage: 20, montant: Math.round(prix * 0.2), dateEcheance: addMonths(dateBlocage, 18) },
  ];
}

export const STATUT_BIEN_LABELS: Record<string, string> = {
  DISPONIBLE: "Disponible",
  BLOQUE_PDG: "Bloqué par le PDG",
  PROPOSITION_EN_COURS: "Proposition en cours",
  VENDU: "Vendu",
  DESISTE: "Désisté",
  LIVRE: "Livré",
};

export const STATUT_BIEN_COLORS: Record<string, string> = {
  DISPONIBLE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  BLOQUE_PDG: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PROPOSITION_EN_COURS: "bg-sky-50 text-sky-700 ring-sky-600/20",
  VENDU: "bg-navy/10 text-navy ring-navy/20",
  DESISTE: "bg-rose-50 text-rose-700 ring-rose-600/20",
  LIVRE: "bg-slate-100 text-slate-700 ring-slate-600/20",
};
