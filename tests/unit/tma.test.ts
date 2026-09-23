import { describe, expect, it } from "vitest";
import { dateLimiteTma, prochainStatutTma, tmaOuvert, STATUTS_TMA, TMA_LABELS } from "@/lib/tma";

describe("TMA : fenêtre de dépôt", () => {
  const blocage = new Date(2026, 8, 1, 10, 30); // 1er septembre 2026, 10 h 30

  it("date limite = blocage + délai, fin de journée", () => {
    expect(dateLimiteTma(blocage, 60)).toEqual(new Date(2026, 9, 31, 23, 59, 59, 999));
    expect(dateLimiteTma(blocage, 0)).toEqual(new Date(2026, 8, 1, 23, 59, 59, 999));
    expect(dateLimiteTma(blocage, -5)).toEqual(new Date(2026, 8, 1, 23, 59, 59, 999));
  });

  it("ouvert tant que le bien est vendu et la limite non dépassée", () => {
    const limite = dateLimiteTma(blocage, 60);
    expect(tmaOuvert({ statut: "VENDU" }, limite, new Date(2026, 9, 31, 12))).toBe(true);
    expect(tmaOuvert({ statut: "VENDU" }, limite, new Date(2026, 10, 1, 0, 0, 0, 1))).toBe(false);
    expect(tmaOuvert({ statut: "LIVRE" }, limite, new Date(2026, 8, 15))).toBe(false);
    expect(tmaOuvert({ statut: "DISPONIBLE" }, limite, new Date(2026, 8, 15))).toBe(false);
  });

  it("suivi des travaux : SIGNE → EN_COURS → TERMINE, rien ailleurs", () => {
    expect(prochainStatutTma("SIGNE")).toBe("EN_COURS");
    expect(prochainStatutTma("EN_COURS")).toBe("TERMINE");
    for (const s of ["DEMANDE", "CHIFFRE", "TERMINE", "REFUSE"]) expect(prochainStatutTma(s)).toBeNull();
  });

  it("chaque statut a un libellé", () => {
    for (const s of STATUTS_TMA) expect(TMA_LABELS[s]).toBeTruthy();
  });
});
