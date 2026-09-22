import { describe, expect, it } from "vitest";
import { ROLES } from "@/db/schema.sqlite";
import { NAV_BY_ROLE, ROLES_RECRUTABLES_PAR, ROLES_RECRUTEURS } from "@/lib/roles";

describe("ROLES_RECRUTABLES_PAR (hiérarchie de création des comptes)", () => {
  it("le Directeur Commercial recrute exactement son pôle", () => {
    expect(ROLES_RECRUTABLES_PAR.DIRECTEUR_COMMERCIAL).toEqual([
      "COMMERCIAL",
      "RESPONSABLE_COMMERCIAL",
      "RESPONSABLE_ADMINISTRATIF",
      "ASSISTANT_ADMINISTRATIF",
      "SERVICE_APRES_VENTE",
    ]);
  });

  it("le Directeur Financier recrute exactement son pôle", () => {
    expect(ROLES_RECRUTABLES_PAR.DIRECTEUR_FINANCIER).toEqual(["COMPTABLE_INTERNE", "RECOUVREMENT"]);
  });

  it("seuls les deux directeurs sont recruteurs", () => {
    expect([...ROLES_RECRUTEURS].sort()).toEqual(["DIRECTEUR_COMMERCIAL", "DIRECTEUR_FINANCIER"]);
  });

  it("les deux pôles ne se recoupent pas", () => {
    const dc = new Set(ROLES_RECRUTABLES_PAR.DIRECTEUR_COMMERCIAL);
    for (const r of ROLES_RECRUTABLES_PAR.DIRECTEUR_FINANCIER!) expect(dc.has(r)).toBe(false);
  });

  it("tout rôle du système a un créateur, sauf les directions et le Super Admin", () => {
    const sansCreateurPair = new Set(["PDG", "DIRECTEUR_COMMERCIAL", "DIRECTEUR_FINANCIER", "SUPER_ADMIN"]);
    const recrutables = new Set(Object.values(ROLES_RECRUTABLES_PAR).flat());
    for (const role of ROLES) {
      if (sansCreateurPair.has(role)) {
        expect(recrutables.has(role)).toBe(false);
      } else {
        expect(recrutables.has(role)).toBe(true);
      }
    }
  });
});

describe("NAV_BY_ROLE", () => {
  it("donne la page Équipe aux deux directeurs et à personne d'autre", () => {
    const aEquipe = (role: keyof typeof NAV_BY_ROLE) => NAV_BY_ROLE[role].some((n) => n.href === "/dashboard/equipe");
    expect(aEquipe("DIRECTEUR_COMMERCIAL")).toBe(true);
    expect(aEquipe("DIRECTEUR_FINANCIER")).toBe(true);
    for (const role of ROLES) {
      if (role === "DIRECTEUR_COMMERCIAL" || role === "DIRECTEUR_FINANCIER") continue;
      expect(aEquipe(role)).toBe(false);
    }
  });
});
