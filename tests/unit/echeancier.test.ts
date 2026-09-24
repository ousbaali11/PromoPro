import { describe, expect, it } from "vitest";
import {
  NB_TRANCHES_MAX,
  decrireEcheancier,
  lireTranchesFormulaire,
  lireTranchesProposition,
  montantTranche,
  verifierModificationEcheancier,
  verifierNouvelEcheancier,
  ymd,
} from "@/lib/echeancier";

const aujourdHui = new Date("2026-09-24T10:00:00");
const demain = "2026-09-25";
const dans6mois = "2027-03-25";
const hier = "2026-09-23";

describe("échéancier flexible : nouvelle proposition (N tranches)", () => {
  it("lit les tranches numérotées du formulaire jusqu'à la première absente", () => {
    const fd = new FormData();
    fd.set("tranche1Pourcentage", "50");
    fd.set("tranche1Date", demain);
    fd.set("tranche2Pourcentage", "50");
    fd.set("tranche2Date", dans6mois);
    fd.set("tranche4Pourcentage", "10"); // ignorée : la 3 manque
    expect(lireTranchesProposition(fd)).toEqual([
      { id: null, pourcentage: 50, date: demain },
      { id: null, pourcentage: 50, date: dans6mois },
    ]);
  });

  it("accepte 100 % en une fois et dix tranches de 10 % ; refuse 0 tranche, un total différent de 100, une date passée, plus de 24 tranches", () => {
    expect(verifierNouvelEcheancier([{ id: null, pourcentage: 100, date: demain }], aujourdHui)).toBeNull();
    const dix = Array.from({ length: 10 }, () => ({ id: null, pourcentage: 10, date: dans6mois }));
    expect(verifierNouvelEcheancier(dix, aujourdHui)).toBeNull();
    expect(verifierNouvelEcheancier([], aujourdHui)).toBe("Renseignez au moins une tranche.");
    expect(verifierNouvelEcheancier([{ id: null, pourcentage: 40, date: demain }, { id: null, pourcentage: 50, date: demain }], aujourdHui)).toBe(
      "Les pourcentages totalisent 90 % au lieu de 100 %.",
    );
    expect(verifierNouvelEcheancier([{ id: null, pourcentage: 100, date: hier }], aujourdHui)).toBe("La date de la tranche 1 ne peut pas être dans le passé.");
    expect(verifierNouvelEcheancier([{ id: null, pourcentage: 100, date: "" }], aujourdHui)).toBe("La date de la tranche 1 est obligatoire.");
    const trop = Array.from({ length: NB_TRANCHES_MAX + 1 }, () => ({ id: null, pourcentage: 4, date: demain }));
    expect(verifierNouvelEcheancier(trop, aujourdHui)).toBe(`Un échéancier ne peut pas dépasser ${NB_TRANCHES_MAX} tranches.`);
    expect(montantTranche(850_000, 33.33)).toBe(283305);
  });
});

describe("échéancier flexible : modification d'une vente conclue", () => {
  const prix = 500_000;
  const existantes = [
    { id: "t1", numero: 1, pourcentage: 40, montant: 200_000, montantPaye: 200_000, statut: "PAYEE", dateEcheance: new Date("2026-08-01") },
    { id: "t2", numero: 2, pourcentage: 20, montant: 100_000, montantPaye: 30_000, statut: "PARTIELLE", dateEcheance: new Date("2027-02-01") },
    { id: "t3", numero: 3, pourcentage: 20, montant: 100_000, montantPaye: 0, statut: "EN_ATTENTE", dateEcheance: new Date("2027-08-01") },
    { id: "t4", numero: 4, pourcentage: 20, montant: 100_000, montantPaye: 0, statut: "EN_ATTENTE", dateEcheance: new Date("2028-02-01") },
  ];
  const saisie = (id: string | null, pourcentage: number, date: string) => ({ id, pourcentage, date });

  it("ajoute une 5e tranche en redécoupant les tranches en attente : renumérotation, montants recalculés, dates inchangées conservées", () => {
    const r = verifierModificationEcheancier(
      existantes,
      [saisie("t1", 40, "2026-08-01"), saisie("t2", 20, "2027-02-01"), saisie("t3", 20, "2027-08-01"), saisie("t4", 10, "2028-02-01"), saisie(null, 10, "2028-08-01")],
      prix,
      aujourdHui,
    );
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.tranches.map((t) => [t.numero, t.id, t.pourcentage, t.montant])).toEqual([
      [1, "t1", 40, 200_000],
      [2, "t2", 20, 100_000],
      [3, "t3", 20, 100_000],
      [4, "t4", 10, 50_000],
      [5, null, 10, 50_000],
    ]);
    expect(r.tranches[0].dateEcheance).toEqual(existantes[0].dateEcheance); // date passée mais inchangée : acceptée
    expect(ymd(r.tranches[4].dateEcheance)).toBe("2028-08-01");
    expect(r.supprimees).toEqual([]);
  });

  it("retire une tranche en attente et renumérote ; une tranche payée ou partielle ne peut pas être retirée", () => {
    const r = verifierModificationEcheancier(existantes, [saisie("t1", 40, "2026-08-01"), saisie("t2", 20, "2027-02-01"), saisie("t4", 40, "2028-02-01")], prix, aujourdHui);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.supprimees).toEqual(["t3"]);
    expect(r.tranches.map((t) => [t.numero, t.id])).toEqual([[1, "t1"], [2, "t2"], [3, "t4"]]);
    expect(verifierModificationEcheancier(existantes, [saisie("t1", 60, "2026-08-01"), saisie("t3", 20, "2027-08-01"), saisie("t4", 20, "2028-02-01")], prix, aujourdHui)).toEqual({
      error: "La tranche 2 a déjà reçu un paiement : elle ne peut pas être supprimée.",
    });
  });

  it("refuse de réduire une tranche sous ce qui a déjà été payé, un total différent de 100 %, une nouvelle date passée, une tranche étrangère", () => {
    expect(verifierModificationEcheancier(existantes, [saisie("t1", 30, "2026-08-01"), saisie("t2", 20, "2027-02-01"), saisie("t3", 30, "2027-08-01"), saisie("t4", 20, "2028-02-01")], prix, aujourdHui)).toEqual({
      error: "La tranche 1 a déjà reçu 200 000 MAD : son montant ne peut pas descendre en dessous.",
    });
    expect(verifierModificationEcheancier(existantes, [saisie("t1", 40, "2026-08-01"), saisie("t2", 5, "2027-02-01"), saisie("t3", 35, "2027-08-01"), saisie("t4", 20, "2028-02-01")], prix, aujourdHui)).toEqual({
      error: "La tranche 2 a déjà reçu 30 000 MAD : son montant ne peut pas descendre en dessous.",
    });
    expect(verifierModificationEcheancier(existantes, [saisie("t1", 40, "2026-08-01"), saisie("t2", 20, "2027-02-01"), saisie("t3", 20, "2027-08-01"), saisie("t4", 10, "2028-02-01")], prix, aujourdHui)).toEqual({
      error: "Les pourcentages totalisent 90 % au lieu de 100 %.",
    });
    expect(verifierModificationEcheancier(existantes, [saisie("t1", 40, "2026-08-01"), saisie("t2", 20, "2027-02-01"), saisie("t3", 20, hier), saisie("t4", 20, "2028-02-01")], prix, aujourdHui)).toEqual({
      error: "La date de la tranche 3 ne peut pas être dans le passé.",
    });
    expect(verifierModificationEcheancier(existantes, [saisie("t1", 40, "2026-08-01"), saisie("t2", 20, "2027-02-01"), saisie("autre", 40, "2028-02-01")], prix, aujourdHui)).toEqual({
      error: "Une tranche du formulaire n'appartient pas à cet échéancier.",
    });
  });

  it("lit les listes parallèles du formulaire et décrit l'échéancier pour le journal", () => {
    expect(lireTranchesFormulaire(["40", "", "60"], ["2026-08-01", "2027-02-01", "2027-08-01"], ["t1", "", "t3"])).toEqual([
      { id: "t1", pourcentage: 40, date: "2026-08-01" },
      { id: null, pourcentage: Number.NaN, date: "2027-02-01" },
      { id: "t3", pourcentage: 60, date: "2027-08-01" },
    ]);
    expect(decrireEcheancier([{ numero: 2, pourcentage: 60, montant: 300_000, dateEcheance: new Date("2027-08-01") }, { numero: 1, pourcentage: 40, montant: 200_000, dateEcheance: new Date("2026-08-01") }])).toBe(
      "T1 40 % (200 000 MAD, 2026-08-01) · T2 60 % (300 000 MAD, 2027-08-01)",
    );
  });
});
