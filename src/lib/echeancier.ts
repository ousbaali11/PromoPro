import { verifierDateEcheance, verifierPourcentages } from "@/lib/validation";

/*
 * Échéancier flexible (phase 3 de la restructuration) : N tranches libres à la
 * proposition (total 100 %), puis modification d'une vente conclue par le
 * commercial — uniquement sur les tranches encore EN_ATTENTE. Une tranche
 * PAYEE ou PARTIELLE ne peut être ni supprimée ni réduite sous ce qui a déjà
 * été payé ; le total reste 100 % du prix. Module pur, testé dans
 * tests/unit/echeancier.test.ts.
 */

export type TrancheSaisie = { id: string | null; pourcentage: number; date: string };
export type TrancheExistante = {
  id: string;
  numero: number;
  pourcentage: number;
  montant: number;
  montantPaye: number;
  statut: string;
  dateEcheance: Date;
};

export const NB_TRANCHES_MAX = 24;

/** Montant en dirhams pour un message ou le journal (espace classique, pas l'espace fine insécable d'Intl). */
export function fmtMad(n: number) {
  return `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} MAD`;
}

/** Montant d'une tranche : pourcentage du prix, arrondi au dirham. */
export function montantTranche(prix: number, pourcentage: number) {
  return Math.round((pourcentage / 100) * prix);
}

/** Lecture des listes parallèles du formulaire (`tranchePourcentage[]`, `trancheDate[]`, `trancheId[]` optionnel), dans l'ordre affiché. */
export function lireTranchesFormulaire(pourcentages: string[], dates: string[], ids: string[] = []): TrancheSaisie[] {
  return pourcentages.map((p, i) => ({
    id: ids[i]?.trim() || null,
    pourcentage: p.trim() === "" ? Number.NaN : Number(p),
    date: dates[i] ?? "",
  }));
}

/** Tranches d'une proposition : champs tranche<N>Pourcentage / tranche<N>Date, N = 1, 2… jusqu'au premier absent. */
export function lireTranchesProposition(formData: FormData): TrancheSaisie[] {
  const tranches: TrancheSaisie[] = [];
  for (let i = 1; i <= NB_TRANCHES_MAX + 1 && formData.has(`tranche${i}Pourcentage`); i++) {
    const brut = String(formData.get(`tranche${i}Pourcentage`) ?? "").trim();
    tranches.push({ id: null, pourcentage: brut === "" ? Number.NaN : Number(brut), date: String(formData.get(`tranche${i}Date`) ?? "") });
  }
  return tranches;
}

/** Règles d'un échéancier neuf (proposition) : 1 à 24 tranches, chaque pourcentage dans ]0 ; 100], total 100 %, dates non passées. */
export function verifierNouvelEcheancier(tranches: TrancheSaisie[], aujourdHui = new Date()): string | null {
  if (tranches.length === 0) return "Renseignez au moins une tranche.";
  if (tranches.length > NB_TRANCHES_MAX) return `Un échéancier ne peut pas dépasser ${NB_TRANCHES_MAX} tranches.`;
  const erreur = verifierPourcentages(tranches.map((t) => t.pourcentage));
  if (erreur) return erreur;
  for (const [i, t] of tranches.entries()) {
    if (!Number.isFinite(t.pourcentage)) return `Le pourcentage de la tranche ${i + 1} est obligatoire.`;
    const erreurDate = verifierDateEcheance(t.date, aujourdHui, `La date de la tranche ${i + 1}`);
    if (erreurDate) return erreurDate;
  }
  return null;
}

export type ModificationEcheancier = {
  /** Tranches finales, dans l'ordre, renumérotées 1..N ; `id` null = tranche à créer. */
  tranches: { id: string | null; numero: number; pourcentage: number; montant: number; dateEcheance: Date }[];
  /** Tranches existantes à supprimer (EN_ATTENTE retirées du formulaire). */
  supprimees: string[];
};

/**
 * Règles de modification d'un échéancier existant :
 * - une tranche PAYEE ou PARTIELLE est conservée obligatoirement, son montant ne
 *   descend jamais sous ce qui a déjà été payé ;
 * - seules les tranches EN_ATTENTE peuvent être retirées, modifiées ou ajoutées ;
 * - la date d'une tranche EN_ATTENTE nouvelle ou modifiée ne peut pas être passée
 *   (une date inchangée, même passée, est acceptée) ;
 * - le total (tranches payées comprises) reste 100 % du prix.
 */
export function verifierModificationEcheancier(
  existantes: TrancheExistante[],
  saisies: TrancheSaisie[],
  prix: number,
  aujourdHui = new Date(),
): ModificationEcheancier | { error: string } {
  if (saisies.length === 0) return { error: "Renseignez au moins une tranche." };
  if (saisies.length > NB_TRANCHES_MAX) return { error: `Un échéancier ne peut pas dépasser ${NB_TRANCHES_MAX} tranches.` };
  const parId = new Map(existantes.map((e) => [e.id, e]));
  const idsSaisis = new Set<string>();
  for (const s of saisies) {
    if (!s.id) continue;
    if (!parId.has(s.id)) return { error: "Une tranche du formulaire n'appartient pas à cet échéancier." };
    if (idsSaisis.has(s.id)) return { error: "Une tranche apparaît deux fois dans le formulaire." };
    idsSaisis.add(s.id);
  }
  for (const e of existantes) {
    if (e.statut !== "EN_ATTENTE" && !idsSaisis.has(e.id)) {
      return { error: `La tranche ${e.numero} a déjà reçu un paiement : elle ne peut pas être supprimée.` };
    }
  }
  const erreurPct = verifierPourcentages(saisies.map((t) => t.pourcentage));
  if (erreurPct) return { error: erreurPct };

  const tranches: ModificationEcheancier["tranches"] = [];
  for (const [i, s] of saisies.entries()) {
    if (!Number.isFinite(s.pourcentage)) return { error: `Le pourcentage de la tranche ${i + 1} est obligatoire.` };
    const montant = montantTranche(prix, s.pourcentage);
    const existante = s.id ? parId.get(s.id) : undefined;
    let dateEcheance: Date;
    if (existante && existante.statut !== "EN_ATTENTE") {
      if (montant < existante.montantPaye) {
        return {
          error: `La tranche ${existante.numero} a déjà reçu ${fmtMad(existante.montantPaye)} : son montant ne peut pas descendre en dessous.`,
        };
      }
      dateEcheance = s.date && s.date !== ymd(existante.dateEcheance) ? new Date(s.date) : existante.dateEcheance;
      if (Number.isNaN(dateEcheance.getTime())) return { error: `La date de la tranche ${i + 1} est invalide.` };
    } else {
      const inchangee = existante && s.date === ymd(existante.dateEcheance);
      if (!inchangee) {
        const erreurDate = verifierDateEcheance(s.date, aujourdHui, `La date de la tranche ${i + 1}`);
        if (erreurDate) return { error: erreurDate };
      }
      dateEcheance = inchangee ? existante.dateEcheance : new Date(s.date);
    }
    tranches.push({ id: s.id, numero: i + 1, pourcentage: s.pourcentage, montant, dateEcheance });
  }
  const supprimees = existantes.filter((e) => !idsSaisis.has(e.id)).map((e) => e.id);
  return { tranches, supprimees };
}

/** Description avant → après pour le journal d'activité. */
export function decrireEcheancier(tranches: { numero: number; pourcentage: number; montant: number; dateEcheance: Date }[]): string {
  return tranches
    .slice()
    .sort((a, b) => a.numero - b.numero)
    .map((t) => `T${t.numero} ${t.pourcentage} % (${fmtMad(t.montant)}, ${ymd(t.dateEcheance)})`)
    .join(" · ");
}

export function ymd(d: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/**
 * Dates par défaut d'une nouvelle proposition (40 % le jour du blocage puis
 * tous les 6 mois), au format des champs date, en heure LOCALE du serveur.
 * `toISOString()` donnait la date UTC : entre minuit et l'heure du décalage
 * (00 h–02 h en été à Paris, 00 h–01 h à Casablanca), la première tranche
 * tombait « hier » et le formulaire refusait sa propre date par défaut.
 */
export function datesEcheancierParDefaut(now = new Date(), ecartMois = [0, 6, 12, 18]): string[] {
  return ecartMois.map((m) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + m);
    return ymd(d);
  });
}
