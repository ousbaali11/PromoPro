import { describe, expect, it } from "vitest";
import { correspond, normaliser, rechercher, requeteValide, MAX_PAR_GROUPE, type ResultatRecherche } from "@/lib/recherche";

const r = (type: ResultatRecherche["type"], titre: string, sousTitre?: string): ResultatRecherche => ({ type, id: titre, titre, sousTitre, href: `/${type}/${titre}` });

describe("recherche globale : logique pure", () => {
  it("normalise accents, casse et espaces ; requête valide à partir de 2 caractères", () => {
    expect(normaliser("  Résidence   Al-Manar ")).toBe("residence al-manar");
    expect(requeteValide("a")).toBe(false);
    expect(requeteValide(" é ")).toBe(false);
    expect(requeteValide("al")).toBe(true);
  });

  it("correspond : tous les mots, ordre libre, accents ignorés", () => {
    expect(correspond("Appartement A01", "a01")).toBe(true);
    expect(correspond("Résidence Al Manar", "manar residence")).toBe(true);
    expect(correspond("Hamid Naciri", "naciri hamid")).toBe(true);
    expect(correspond("Hamid Naciri", "naciri omar")).toBe(false);
    expect(correspond("x", "")).toBe(false);
  });

  it("groupe par type dans l'ordre biens, clients, projets ; omet les groupes vides ; priorité aux titres commençant par la requête", () => {
    const groupes = rechercher(
      {
        bien: [r("bien", "Parking P01"), r("bien", "Appartement A01", "Al Manar · Vendu"), r("bien", "Appartement A02")],
        client: [r("client", "Hamid Naciri", "CL-DEMO")],
        projet: [r("projet", "Résidence Al Manar", "SCI Al Manar")],
      },
      "al",
    );
    expect(groupes.map((g) => g.type)).toEqual(["bien", "projet"]);
    expect(groupes[0].resultats.map((x) => x.titre)).toEqual(["Appartement A01"]); // « al » dans le sous-titre Al Manar
    expect(groupes[1].resultats[0].titre).toBe("Résidence Al Manar");

    const clients = rechercher({ bien: [], client: [r("client", "Zineb Benali"), r("client", "Hamid Naciri")], projet: [] }, "na");
    expect(clients[0].resultats.map((x) => x.titre)).toEqual(["Hamid Naciri", "Zineb Benali"]); // Naciri commence par « na »
  });

  it("limite chaque groupe et renvoie vide pour une requête trop courte", () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) => r("bien", `Lot ${String(i + 1).padStart(2, "0")}`));
    const g = rechercher({ bien: beaucoup, client: [], projet: [] }, "lot");
    expect(g[0].resultats).toHaveLength(MAX_PAR_GROUPE);
    expect(g[0].resultats[0].titre).toBe("Lot 01");
    expect(rechercher({ bien: beaucoup, client: [], projet: [] }, "l")).toEqual([]);
  });
});
