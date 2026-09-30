import { describe, expect, it } from "vitest";
import { ajouterMois, dureeValide, echeanceProlongee, formulePour, jourIso } from "@/lib/abonnement";

describe("prolongation d'abonnement", () => {
  const now = new Date(2026, 8, 30, 12); // 30 septembre 2026, midi (local)

  it("prolonge depuis l'échéance en cours quand elle est encore à venir : le temps déjà payé n'est pas perdu", () => {
    const fin = new Date(2027, 2, 15); // 15 mars 2027
    expect(jourIso(echeanceProlongee(fin, 1, now))).toBe("2027-04-15");
    expect(jourIso(echeanceProlongee(fin, 12, now))).toBe("2028-03-15");
  });

  it("prolonge depuis aujourd'hui quand l'abonnement est échu ou sans échéance", () => {
    expect(jourIso(echeanceProlongee(new Date(2026, 0, 1), 1, now))).toBe("2026-10-30");
    expect(jourIso(echeanceProlongee(null, 12, now))).toBe("2027-09-30");
    // Valeurs numériques (SQLite) ou chaînes acceptées
    expect(jourIso(echeanceProlongee(new Date(2027, 0, 10).getTime(), 1, now))).toBe("2027-02-10");
  });

  it("durées proposées, formule associée, ajout de mois", () => {
    expect(dureeValide(1)).toBe(true);
    expect(dureeValide(12)).toBe(true);
    expect(dureeValide(6)).toBe(false);
    expect(formulePour(1)).toBe("Mensuel");
    expect(formulePour(12)).toBe("Annuel");
    expect(jourIso(ajouterMois(new Date(2026, 11, 31), 2))).toBe("2027-03-03"); // comportement de Date, identique à l'activation
    expect(jourIso(null)).toBe("");
  });
});
