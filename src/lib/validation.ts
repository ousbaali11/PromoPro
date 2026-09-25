/*
 * Règles de validation partagées (montants, dates, pourcentages, textes).
 * Fonctions pures : chaque règle renvoie `null` si la valeur est acceptable,
 * sinon un message d'erreur prêt à afficher. Testées dans
 * tests/unit/validation.test.ts ; appliquées par les Server Actions.
 */

/** Longueurs maximales des textes libres (caractères). */
export const LONGUEURS = {
  nom: 100,
  designation: 120,
  courte: 200, // libellés : nom de projet, compte, source, banque, porteur, référence…
  moyenne: 1000, // motifs, retours client, commentaires
  longue: 2000, // descriptions (TMA)
} as const;

/** Nombre entier ou décimal lu depuis un formulaire ; NaN si vide ou invalide. */
export function lireNombre(valeur: FormDataEntryValue | string | null | undefined): number {
  const s = String(valeur ?? "").trim().replace(",", ".");
  if (!s) return Number.NaN;
  return Number(s);
}

function decimales(n: number): number {
  const s = String(n);
  if (s.includes("e-")) return 10;
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/**
 * Montant strictement positif, fini, avec au plus `maxDecimales` décimales
 * (2 pour le dirham comme pour l'euro), et éventuellement plafonné.
 */
export function verifierMontant(
  montant: number,
  { libelle = "Le montant", maxDecimales = 2, max, maxLibelle }: { libelle?: string; maxDecimales?: number; max?: number; maxLibelle?: string } = {},
): string | null {
  if (!Number.isFinite(montant)) return `${libelle} est obligatoire.`;
  if (montant <= 0) return `${libelle} doit être strictement positif.`;
  if (decimales(montant) > maxDecimales) return `${libelle} ne peut pas avoir plus de ${maxDecimales} décimales.`;
  if (max !== undefined && montant > max) return `${libelle} dépasse ${maxLibelle ?? `le maximum autorisé (${max})`}.`;
  return null;
}

/** Date lue depuis un champ (aaaa-mm-jj ou ISO) ; null si vide ou invalide. */
export function lireDate(valeur: FormDataEntryValue | string | null | undefined): Date | null {
  const s = String(valeur ?? "").trim();
  if (!s) return null;
  // Une date seule (champ <input type="date">) est un jour LOCAL : new Date("AAAA-MM-JJ")
  // la lirait à minuit UTC, soit la veille au soir à l'ouest de Greenwich.
  const jour = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = jour ? new Date(Number(jour[1]), Number(jour[2]) - 1, Number(jour[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function debutDeJournee(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Date de naissance : valide, pas dans le futur, pas avant 1900. Vide accepté (champ facultatif). */
export function verifierDateNaissance(valeur: string | null | undefined, now = new Date()): string | null {
  if (!valeur) return null;
  const d = lireDate(valeur);
  if (!d) return "La date de naissance est invalide.";
  if (d.getTime() > now.getTime()) return "La date de naissance ne peut pas être dans le futur.";
  if (d.getFullYear() < 1900) return "La date de naissance est trop ancienne.";
  return null;
}

/** Date d'échéance à la création : valide et pas antérieure à aujourd'hui. */
export function verifierDateEcheance(valeur: string | null | undefined, now = new Date(), libelle = "La date d'échéance"): string | null {
  const d = lireDate(valeur);
  if (!d) return `${libelle} est obligatoire.`;
  if (d.getTime() < debutDeJournee(now).getTime()) return `${libelle} ne peut pas être dans le passé.`;
  return null;
}

/**
 * Échéancier d'une proposition : au moins une tranche, chaque pourcentage
 * entre 0 exclu et 100 inclus (2 décimales au plus), total exactement 100 %.
 */
export function verifierPourcentages(pourcentages: number[]): string | null {
  const renseignes = pourcentages.filter((p) => Number.isFinite(p));
  if (renseignes.length === 0) return "Renseignez au moins une tranche.";
  for (const p of renseignes) {
    if (p <= 0 || p > 100) return "Chaque pourcentage doit être compris entre 0 (exclu) et 100.";
    if (decimales(p) > 2) return "Les pourcentages ne peuvent pas avoir plus de 2 décimales.";
  }
  const total = Math.round(renseignes.reduce((s, p) => s + p, 0) * 100) / 100;
  if (total !== 100) return `Les pourcentages totalisent ${total} % au lieu de 100 %.`;
  return null;
}

export const DELAI_TMA_MAX_JOURS = 3650;

/** Délai TMA d'un projet : entier de 1 à 3650 jours (0 ou négatif refusé). */
export function verifierDelaiTma(valeur: number): string | null {
  if (!Number.isFinite(valeur)) return "Le délai des travaux modificatifs est obligatoire.";
  if (!Number.isInteger(valeur)) return "Le délai des travaux modificatifs doit être un nombre entier de jours.";
  if (valeur < 1) return "Le délai des travaux modificatifs doit être d'au moins 1 jour.";
  if (valeur > DELAI_TMA_MAX_JOURS) return `Le délai des travaux modificatifs ne peut pas dépasser ${DELAI_TMA_MAX_JOURS} jours.`;
  return null;
}

/** Texte libre : longueur bornée (les caractères spéciaux, emoji ou balises sont acceptés tels quels et affichés échappés). */
export function verifierTexte(valeur: string, { libelle, max, obligatoire = false }: { libelle: string; max: number; obligatoire?: boolean }): string | null {
  const t = valeur.trim();
  if (obligatoire && !t) return `${libelle} est obligatoire.`;
  if (t.length > max) return `${libelle} ne peut pas dépasser ${max} caractères (${t.length} saisis).`;
  return null;
}
