/*
 * Imputation d'un montant validé sur un échéancier (section 11.9), en pur :
 * on part de la tranche visée (ou de la première non soldée), chaque tranche
 * reçoit au plus son restant dû, l'excédent passe à la suivante ; un excédent
 * après la dernière tranche est conservé sur celle-ci (montantPaye > montant).
 * Aucune tranche n'est jamais négative et la somme des imputations vaut
 * exactement le montant. Testé dans tests/unit/imputation.test.ts.
 */

export type TrancheImputable = { id: string; numero: number; montant: number; montantPaye: number; statut: string };

export type Imputation = { echeanceId: string; numero: number; montant: number };

export type EtatTranche = { id: string; montantPaye: number; statut: "PAYEE" | "PARTIELLE" };

/** Reste à percevoir sur une tranche (jamais négatif, zéro si soldée). */
export function restantTranche(t: { montant: number; montantPaye: number; statut?: string }): number {
  if (t.statut === "PAYEE") return 0;
  return Math.max(0, Math.round((t.montant - t.montantPaye) * 100) / 100);
}

/** Reste à percevoir sur tout l'échéancier. */
export function restantDuTotal(tranches: { montant: number; montantPaye: number; statut?: string }[]): number {
  return Math.round(tranches.reduce((s, t) => s + restantTranche(t), 0) * 100) / 100;
}

export function repartirImputation(tranches: TrancheImputable[], echeanceId: string | null, montant: number): { imputations: Imputation[]; etats: EtatTranche[] } {
  const liste = [...tranches].sort((a, b) => a.numero - b.numero);
  const imputations: Imputation[] = [];
  const etats: EtatTranche[] = [];
  if (liste.length === 0 || !(montant > 0)) return { imputations, etats };

  let startIdx = echeanceId ? liste.findIndex((e) => e.id === echeanceId) : -1;
  if (startIdx < 0) startIdx = Math.max(0, liste.findIndex((e) => e.statut !== "PAYEE"));

  let restant = Math.round(montant * 100) / 100;
  for (let i = startIdx; i < liste.length && restant > 0; i++) {
    const e = liste[i];
    const du = restantTranche(e);
    const derniere = i === liste.length - 1;
    const part = derniere ? restant : Math.min(du, restant);
    if (part <= 0) continue;
    const nouveauPaye = Math.round((e.montantPaye + part) * 100) / 100;
    etats.push({ id: e.id, montantPaye: nouveauPaye, statut: nouveauPaye >= e.montant ? "PAYEE" : "PARTIELLE" });
    imputations.push({ echeanceId: e.id, numero: e.numero, montant: part });
    restant = Math.round((restant - part) * 100) / 100;
  }
  return { imputations, etats };
}
