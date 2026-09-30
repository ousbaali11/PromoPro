import { describe, expect, it } from "vitest";
import { avertissementDernierTitulaire, estRoleDirection, rolesSansTitulaire, titulairesActifs, trierDirections } from "@/lib/directions";

const d = (id: string, role: "PDG" | "DIRECTEUR_COMMERCIAL" | "DIRECTEUR_FINANCIER", etat: "actif" | "suspendu" | "supprime" = "actif", nom = id) => ({
  id,
  role,
  nom,
  actif: etat !== "suspendu",
  deletedAt: etat === "supprime" ? new Date("2026-09-01") : null,
});

describe("directions d'un promoteur", () => {
  it("dernier titulaire actif d'un rôle : avertissement explicite, sans blocage", () => {
    const directions = [d("pdg1", "PDG"), d("dc1", "DIRECTEUR_COMMERCIAL"), d("df1", "DIRECTEUR_FINANCIER")];
    expect(avertissementDernierTitulaire(directions, directions[0])).toBe("Ce promoteur n'aura plus aucun PDG après cette action.");
    expect(avertissementDernierTitulaire(directions, directions[1])).toBe("Ce promoteur n'aura plus aucun Directeur Commercial après cette action.");
  });

  it("un autre titulaire actif du même rôle : aucun avertissement ; un titulaire suspendu ou supprimé ne compte pas", () => {
    const pdg1 = d("pdg1", "PDG");
    expect(avertissementDernierTitulaire([pdg1, d("pdg2", "PDG")], pdg1)).toBeNull();
    expect(avertissementDernierTitulaire([pdg1, d("pdg2", "PDG", "suspendu")], pdg1)).not.toBeNull();
    expect(avertissementDernierTitulaire([pdg1, d("pdg2", "PDG", "supprime")], pdg1)).not.toBeNull();
    // Une cible qui n'exerce déjà plus n'a pas d'avertissement (sa réactivation n'enlève rien)
    const suspendu = d("pdg3", "PDG", "suspendu");
    expect(avertissementDernierTitulaire([suspendu], suspendu)).toBeNull();
  });

  it("rôles sans titulaire, titulaires actifs et tri par rôle puis nom", () => {
    const directions = [d("df", "DIRECTEUR_FINANCIER", "actif", "Zidane"), d("dcB", "DIRECTEUR_COMMERCIAL", "actif", "Bennis"), d("dcA", "DIRECTEUR_COMMERCIAL", "actif", "Alami"), d("pdg", "PDG", "supprime")];
    expect(rolesSansTitulaire(directions)).toEqual(["PDG"]);
    expect(rolesSansTitulaire([])).toEqual(["PDG", "DIRECTEUR_COMMERCIAL", "DIRECTEUR_FINANCIER"]);
    expect(titulairesActifs(directions, "DIRECTEUR_COMMERCIAL").map((x) => x.id)).toEqual(["dcB", "dcA"]);
    expect(trierDirections(directions).map((x) => x.id)).toEqual(["pdg", "dcA", "dcB", "df"]);
    expect(estRoleDirection("PDG")).toBe(true);
    expect(estRoleDirection("COMMERCIAL")).toBe(false);
  });
});
