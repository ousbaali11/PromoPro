import { describe, expect, it } from "vitest";
import { GROUPES_NATURES, MESSAGE_NATURE_INVALIDE, NATURES_BIEN, NATURE_PAR_DEFAUT, natureValide } from "@/lib/natures-biens";

describe("natures de biens", () => {
  it("conserve les quatre natures historiques et en propose bien davantage, sans doublon", () => {
    for (const n of ["Appartement", "Parking", "Local commercial", "Villa"]) expect(natureValide(n)).toBe(true);
    for (const n of ["Garage", "Terrain constructible", "Maison", "Bureau", "Cave", "Immeuble", "Studio", "Riad"]) expect(natureValide(n)).toBe(true);
    expect(NATURES_BIEN.length).toBeGreaterThanOrEqual(30);
    expect(new Set(NATURES_BIEN).size).toBe(NATURES_BIEN.length);
    expect(NATURE_PAR_DEFAUT).toBe("Appartement");
  });

  it("refuse une nature hors liste (casse et espaces compris) ; groupes non vides avec un libellé", () => {
    expect(natureValide("Château")).toBe(false);
    expect(natureValide("appartement")).toBe(false);
    expect(natureValide(" Villa")).toBe(false);
    expect(natureValide("")).toBe(false);
    for (const g of GROUPES_NATURES) {
      expect(g.groupe.length).toBeGreaterThan(0);
      expect(g.natures.length).toBeGreaterThan(0);
    }
    expect(MESSAGE_NATURE_INVALIDE).toContain("liste");
  });
});
