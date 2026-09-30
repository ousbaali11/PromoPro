/*
 * Abonnement d'un promoteur : durées proposées et calcul des échéances.
 * Fonctions pures, testées dans tests/unit/abonnement.test.ts.
 *
 * L'échéance est affichée mais n'est pas bloquante (seul le statut compte) ;
 * le Super Admin peut néanmoins prolonger un abonnement ACTIF à tout moment,
 * sans attendre la date d'expiration : la prolongation s'ajoute à l'échéance
 * en cours si elle est encore à venir, sinon elle part d'aujourd'hui.
 */

export const DUREES_ABONNEMENT = [
  { mois: 1, formule: "Mensuel" },
  { mois: 12, formule: "Annuel" },
] as const;

export type DureeMois = (typeof DUREES_ABONNEMENT)[number]["mois"];

export function dureeValide(mois: number): mois is DureeMois {
  return DUREES_ABONNEMENT.some((d) => d.mois === mois);
}

export function formulePour(mois: DureeMois) {
  return DUREES_ABONNEMENT.find((d) => d.mois === mois)!.formule;
}

/** Même jour du mois, `mois` plus tard (31 janvier + 1 mois → 3 mars, comportement de Date, inchangé depuis l'activation). */
export function ajouterMois(date: Date, mois: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + mois);
  return d;
}

/**
 * Nouvelle échéance après prolongation : depuis l'échéance actuelle si elle
 * est encore à venir (le temps déjà payé n'est jamais perdu), sinon depuis
 * maintenant (abonnement échu ou sans échéance).
 */
export function echeanceProlongee(finActuelle: Date | number | string | null | undefined, mois: number, now = new Date()) {
  const fin = finActuelle ? new Date(finActuelle) : null;
  const base = fin && fin.getTime() > now.getTime() ? fin : now;
  return ajouterMois(base, mois);
}

/** Date au format aaaa-mm-jj (jour local), pour les attributs de données. */
export function jourIso(date: Date | number | string | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
