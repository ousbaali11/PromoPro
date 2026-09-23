import type { Tone } from "@/components/ui/Primitives";

/*
 * Travaux Modificatifs Acquéreurs (TMA) : un client demande une modification
 * de son bien (cloison, prise, revêtement…), le SAV la chiffre avec un devis,
 * le client accepte le devis, puis les travaux sont suivis jusqu'à leur fin.
 *
 * Fenêtre de dépôt : jusqu'à `delaiTmaJours` (réglé par projet, 60 j par
 * défaut) après le blocage du bien — la date d'acceptation de la proposition,
 * qui est aussi celle de la première tranche — et tant que le bien n'est pas
 * livré.
 *
 * Limitation à connaître : « J'accepte ce devis » est une case cochée et
 * horodatée (signatureClientAt), pas une signature électronique au sens
 * juridique (pas de certificat, ni d'archivage probant).
 */

export const STATUTS_TMA = ["DEMANDE", "CHIFFRE", "SIGNE", "EN_COURS", "TERMINE", "REFUSE"] as const;
export type StatutTma = (typeof STATUTS_TMA)[number];

export const TMA_LABELS: Record<StatutTma, string> = {
  DEMANDE: "Demande envoyée",
  CHIFFRE: "Devis à accepter",
  SIGNE: "Devis accepté",
  EN_COURS: "Travaux en cours",
  TERMINE: "Travaux terminés",
  REFUSE: "Refusée",
};

export const TMA_TONES: Record<StatutTma, Tone> = {
  DEMANDE: "warning",
  CHIFFRE: "info",
  SIGNE: "gold",
  EN_COURS: "navy",
  TERMINE: "success",
  REFUSE: "danger",
};

/** Délai par défaut d'un projet, en jours après le blocage. */
export const DELAI_TMA_DEFAUT_JOURS = 60;

/** Date limite de dépôt : blocage + délai (jours), fin de journée. */
export function dateLimiteTma(dateBlocage: Date | number | string, delaiJours: number): Date {
  const d = new Date(dateBlocage);
  d.setDate(d.getDate() + Math.max(0, Math.floor(delaiJours)));
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Le client peut-il encore déposer une demande ? Bien vendu (pas livré, pas
 * désisté) et date limite non dépassée.
 */
export function tmaOuvert(bien: { statut: string }, dateLimite: Date, now = new Date()): boolean {
  return bien.statut === "VENDU" && now.getTime() <= dateLimite.getTime();
}

/** Transition suivante du suivi des travaux (SAV), ou null si aucune. */
export function prochainStatutTma(statut: string): StatutTma | null {
  if (statut === "SIGNE") return "EN_COURS";
  if (statut === "EN_COURS") return "TERMINE";
  return null;
}
