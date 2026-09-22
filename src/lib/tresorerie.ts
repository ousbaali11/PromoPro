import type { echeances, paiements } from "@/db/schema";

type Paiement = typeof paiements.$inferSelect;
type Echeance = typeof echeances.$inferSelect;

/**
 * Trésorerie du Directeur Financier (section 8.1).
 *
 * Seuls les paiements VALIDÉS par le Comptable Interne comptent, pour leur
 * montant exact reçu. La « date de trésorerie » d'un paiement est :
 * - pour un chèque : la date d'encaissement prévue (`dateEncaissementCheque`),
 * - sinon : la date de réception effective (`dateReception`), à défaut la
 *   date de l'opération.
 */
export function dateTresorerie(p: Paiement): Date | null {
  if (p.natureOperation === "cheque") return p.dateEncaissementCheque ?? p.dateReception ?? p.dateOperation;
  return p.dateReception ?? p.dateOperation;
}

export function montantValide(p: Paiement) {
  return p.montantExact ?? p.montant;
}

function debutJour(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function finJour(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function calculerTresorerie(listePaiements: Paiement[], listeEcheances: Echeance[], now = new Date()) {
  const valides = listePaiements.filter((p) => p.statut === "VALIDE");
  const debut = debutJour(now);
  const fin = finJour(now);
  const finJ7 = finJour(new Date(now.getTime() + 7 * 24 * 3600 * 1000));

  const dans = (p: Paiement, a: Date, b: Date) => {
    const d = dateTresorerie(p);
    return !!d && d.getTime() >= a.getTime() && d.getTime() <= b.getTime();
  };
  const somme = (liste: Paiement[]) => liste.reduce((s, p) => s + montantValide(p), 0);

  const cheques = valides.filter((p) => p.natureOperation === "cheque");
  const chequesEncaisses = cheques.filter((p) => (dateTresorerie(p)?.getTime() ?? 0) <= fin.getTime());
  const chequesAVenir = cheques.filter((p) => (dateTresorerie(p)?.getTime() ?? 0) > fin.getTime());

  const virements = valides.filter((p) => p.natureOperation !== "cheque");
  const virementsDuJour = virements.filter((p) => dans(p, debut, fin));

  // Échéances futures connues (restant dû), pour les entrées à venir
  const echeancesAVenir = listeEcheances
    .filter((e) => e.statut !== "PAYEE" && e.dateEcheance.getTime() > fin.getTime())
    .map((e) => ({ ...e, restant: Math.max(0, e.montant - e.montantPaye) }))
    .filter((e) => e.restant > 0)
    .sort((a, b) => a.dateEcheance.getTime() - b.dateEcheance.getTime());

  return {
    totalDuJour: somme(valides.filter((p) => dans(p, debut, fin))),
    totalA7Jours: somme(valides.filter((p) => dans(p, debut, finJ7))),
    chequesEncaisses,
    chequesAVenir,
    totalChequesEncaisses: somme(chequesEncaisses),
    totalChequesAVenir: somme(chequesAVenir),
    virements,
    virementsDuJour,
    totalVirementsDuJour: somme(virementsDuJour),
    totalVirements: somme(virements),
    echeancesAVenir,
    totalEcheancesA7Jours: echeancesAVenir
      .filter((e) => e.dateEcheance.getTime() <= finJ7.getTime())
      .reduce((s, e) => s + e.restant, 0),
  };
}
