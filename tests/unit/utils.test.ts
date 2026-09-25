import { describe, expect, it } from "vitest";
import { defaultEcheancier, formatDate, formatMoney, addMonths, libelleStatutPaiement, toneStatutPaiement } from "@/lib/utils";

const espaces = (s: string) => s.replace(/[  ]/g, " ");

describe("defaultEcheancier", () => {
  const blocage = new Date(2026, 0, 15); // 15 janvier 2026
  const ech = defaultEcheancier(1_000_000, blocage);

  it("produit 4 tranches 40/20/20/20 pour 100 % du prix", () => {
    expect(ech.map((e) => e.numero)).toEqual([1, 2, 3, 4]);
    expect(ech.map((e) => e.pourcentage)).toEqual([40, 20, 20, 20]);
    expect(ech.map((e) => e.montant)).toEqual([400_000, 200_000, 200_000, 200_000]);
    expect(ech.reduce((s, e) => s + e.montant, 0)).toBe(1_000_000);
  });

  it("place la 1re tranche le jour du blocage puis +6, +12 et +18 mois", () => {
    expect(ech[0].dateEcheance).toEqual(blocage);
    expect(ech[1].dateEcheance).toEqual(new Date(2026, 6, 15));
    expect(ech[2].dateEcheance).toEqual(new Date(2027, 0, 15));
    expect(ech[3].dateEcheance).toEqual(new Date(2027, 6, 15));
  });

  it("arrondit les montants à l'unité", () => {
    const e = defaultEcheancier(850_001, blocage);
    expect(e.every((x) => Number.isInteger(x.montant))).toBe(true);
    expect(e[0].montant).toBe(Math.round(850_001 * 0.4));
  });
});

describe("addMonths", () => {
  it("ne modifie pas la date d'origine", () => {
    const d = new Date(2026, 0, 31);
    const r = addMonths(d, 1);
    expect(d).toEqual(new Date(2026, 0, 31));
    expect(r.getMonth()).toBe(2); // 31 janv. + 1 mois déborde sur mars (comportement JS documenté)
  });
});

describe("formatMoney", () => {
  it("sépare les milliers et ajoute la devise MAD par défaut", () => {
    expect(espaces(formatMoney(850_000))).toBe("850 000 MAD");
  });
  it("accepte une autre devise et n'affiche pas de décimales", () => {
    expect(espaces(formatMoney(1500.6, "EUR"))).toBe("1 501 EUR");
    expect(espaces(formatMoney(0))).toBe("0 MAD");
  });
});

describe("formatDate", () => {
  it("affiche un tiret pour une date absente", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
  it("formate en français court", () => {
    expect(espaces(formatDate(new Date(2026, 8, 22)))).toBe("22 sept. 2026");
    expect(espaces(formatDate(new Date(2027, 1, 3)))).toBe("03 févr. 2027");
  });
});

describe("statuts de paiement", () => {
  it("libellés par espace et tonalités", () => {
    expect(libelleStatutPaiement("EN_ATTENTE_COMPTABLE")).toBe("En attente comptable");
    expect(libelleStatutPaiement("EN_ATTENTE_COMPTABLE", "client")).toBe("En vérification");
    expect(libelleStatutPaiement("VALIDE", "client")).toBe("Validé");
    expect(libelleStatutPaiement("ANNULE_DESISTEMENT")).toBe("Annulé (désistement)");
    expect(toneStatutPaiement("VALIDE")).toBe("success");
    expect(toneStatutPaiement("EN_ATTENTE_COMPTABLE")).toBe("warning");
    expect(toneStatutPaiement("ANNULE_DESISTEMENT")).toBe("neutral");
  });
});
