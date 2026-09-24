import { describe, expect, it } from "vitest";
import { repartirImputation, restantDuTotal, restantTranche, type TrancheImputable } from "@/lib/imputation";

const echeancier = (paye: number[] = [0, 0, 0, 0], statuts?: string[]): TrancheImputable[] =>
  [340000, 170000, 170000, 170000].map((montant, i) => ({
    id: `t${i + 1}`,
    numero: i + 1,
    montant,
    montantPaye: paye[i],
    statut: statuts?.[i] ?? (paye[i] >= montant ? "PAYEE" : paye[i] > 0 ? "PARTIELLE" : "EN_ATTENTE"),
  }));

describe("imputation d'un paiement sur l'échéancier (trop-perçu en cascade)", () => {
  it("restant dû : jamais négatif, nul sur une tranche soldée, total cohérent", () => {
    expect(restantTranche({ montant: 100, montantPaye: 30 })).toBe(70);
    expect(restantTranche({ montant: 100, montantPaye: 130 })).toBe(0);
    expect(restantTranche({ montant: 100, montantPaye: 0, statut: "PAYEE" })).toBe(0);
    expect(restantDuTotal(echeancier([340000, 0, 0, 0]))).toBe(510000);
  });

  it("un paiement de 0 n'impute rien", () => {
    expect(repartirImputation(echeancier(), "t2", 0)).toEqual({ imputations: [], etats: [] });
    expect(repartirImputation(echeancier(), "t2", -50)).toEqual({ imputations: [], etats: [] });
  });

  it("cascade : l'excédent d'une tranche passe à la suivante, la somme des imputations vaut le montant", () => {
    const { imputations, etats } = repartirImputation(echeancier([340000, 0, 0, 0]), "t2", 200000);
    expect(imputations).toEqual([
      { echeanceId: "t2", numero: 2, montant: 170000 },
      { echeanceId: "t3", numero: 3, montant: 30000 },
    ]);
    expect(etats).toEqual([
      { id: "t2", montantPaye: 170000, statut: "PAYEE" },
      { id: "t3", montantPaye: 30000, statut: "PARTIELLE" },
    ]);
    expect(imputations.reduce((s, i) => s + i.montant, 0)).toBe(200000);
  });

  it("paiement supérieur au prix total : toutes les tranches soldées, l'excédent porté sur la dernière, rien de négatif", () => {
    const { imputations, etats } = repartirImputation(echeancier(), null, 2_000_000);
    expect(etats.map((e) => e.statut)).toEqual(["PAYEE", "PAYEE", "PAYEE", "PAYEE"]);
    expect(etats.every((e) => e.montantPaye >= 0)).toBe(true);
    expect(etats[3].montantPaye).toBe(170000 + 1_150_000); // 2 000 000 − 850 000 d'excédent conservé sur la dernière
    expect(imputations.reduce((s, i) => s + i.montant, 0)).toBe(2_000_000);
    // Les trois premières tranches ne dépassent jamais leur montant (100 % au plus)
    expect(etats.slice(0, 3).every((e, i) => e.montantPaye <= echeancier()[i].montant)).toBe(true);
  });

  it("part de la première tranche non soldée si aucune tranche n'est visée ou si la tranche visée est inconnue", () => {
    const r = repartirImputation(echeancier([340000, 170000, 0, 0]), "inexistante", 100);
    expect(r.imputations).toEqual([{ echeanceId: "t3", numero: 3, montant: 100 }]);
  });

  it("arrondit au centime et ne laisse pas de résidu flottant", () => {
    const { imputations, etats } = repartirImputation(echeancier([0, 0, 0, 0]), "t1", 0.1 + 0.2);
    expect(imputations[0].montant).toBe(0.3);
    expect(etats[0]).toEqual({ id: "t1", montantPaye: 0.3, statut: "PARTIELLE" });
  });
});
