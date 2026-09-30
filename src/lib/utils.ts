import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatMoney(amount: number, devise = "MAD") {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " " + devise;
}

/** À partir d'un million, les cartes de synthèse passent en forme compacte. */
export const SEUIL_MONTANT_COMPACT = 1_000_000;

// Échelons français : million, milliard, billion (10^12), billiard (10^15). Au-delà, le nombre
// d'unités du dernier échelon s'affiche avec ses séparateurs de milliers : la longueur reste bornée.
const ECHELONS_MONTANT: [number, string][] = [
  [1e15, "Bd"],
  [1e12, "Bn"],
  [1e9, "Md"],
  [1e6, "M"],
];

/**
 * Forme compacte d'un montant pour les tableaux de bord : « 850 000 MAD » en
 * dessous du million, puis « 2,14 M MAD », « 1,07 Md MAD », « 12,5 Bn MAD »…
 * avec trois chiffres significatifs. L'affichage garde donc une longueur
 * bornée quelle que soit la croissance des montants ; la valeur exacte est
 * donnée à côté (info-bulle, attribut) par le composant MontantCompact.
 */
export function formatMoneyCompact(amount: number, devise = "MAD") {
  const absolu = Math.abs(amount);
  if (!Number.isFinite(amount) || absolu < SEUIL_MONTANT_COMPACT) return formatMoney(amount, devise);
  const [echelon, suffixe] = ECHELONS_MONTANT.find(([e]) => absolu >= e) ?? ECHELONS_MONTANT[ECHELONS_MONTANT.length - 1];
  const unites = amount / echelon;
  const nombre =
    Math.abs(unites) < 1000
      ? new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 3 }).format(unites)
      : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(unites);
  return `${nombre} ${suffixe} ${devise}`;
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

/** Tonalité sémantique (design system) de chaque statut de bien. */
export const STATUT_BIEN_TONES: Record<string, "success" | "warning" | "info" | "navy" | "danger" | "neutral"> = {
  DISPONIBLE: "success",
  BLOQUE_PDG: "warning",
  PROPOSITION_EN_COURS: "info",
  VENDU: "navy",
  DESISTE: "danger",
  LIVRE: "neutral",
};

export const STATUT_BIEN_COLORS: Record<string, string> = {
  DISPONIBLE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  BLOQUE_PDG: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PROPOSITION_EN_COURS: "bg-sky-50 text-sky-700 ring-sky-600/20",
  VENDU: "bg-navy/10 text-navy ring-navy/20",
  DESISTE: "bg-rose-50 text-rose-700 ring-rose-600/20",
  LIVRE: "bg-slate-100 text-slate-700 ring-slate-600/20",
};

/**
 * Statuts d'un paiement : EN_ATTENTE_COMPTABLE (saisi, à référencer et valider),
 * VALIDE, ANNULE_DESISTEMENT (annulé automatiquement par le désistement du
 * client avant validation : aucune opération comptable à faire).
 */
export function libelleStatutPaiement(statut: string, vue: "client" | "staff" = "staff"): string {
  if (statut === "VALIDE") return "Validé";
  if (statut === "ANNULE_DESISTEMENT") return "Annulé (désistement)";
  return vue === "client" ? "En vérification" : "En attente comptable";
}

export function toneStatutPaiement(statut: string): "success" | "warning" | "neutral" {
  if (statut === "VALIDE") return "success";
  if (statut === "ANNULE_DESISTEMENT") return "neutral";
  return "warning";
}
