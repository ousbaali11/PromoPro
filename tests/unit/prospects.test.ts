import { describe, expect, it } from "vitest";
import { analyserLignes, detecterColonnes, ecartCharge, normaliserEntete, repartitionEquilibree, telephoneCanonique } from "@/lib/prospects";

describe("répartition équilibrée des prospects", () => {
  const nouveaux = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

  it("3 commerciaux à 0 / 2 / 5 et 10 nouveaux : écart final ≤ 1, tout est attribué", () => {
    const { parCommercial, ecart } = repartitionEquilibree(
      [
        { id: "a", charge: 0 },
        { id: "b", charge: 2 },
        { id: "c", charge: 5 },
      ],
      nouveaux(10),
    );
    expect(ecart).toBeLessThanOrEqual(1);
    expect(parCommercial.reduce((s, c) => s + c.attribues.length, 0)).toBe(10);
    // 17 au total sur 3 → 6 / 6 / 5 : a reçoit 6, b 4, c 0
    expect(parCommercial.map((c) => c.total)).toEqual([6, 6, 5]);
    expect(parCommercial.map((c) => c.attribues.length)).toEqual([6, 4, 0]);
    expect(parCommercial.every((c) => c.total === c.chargeInitiale + c.attribues.length)).toBe(true);
  });

  it.each([
    [[0, 0], 10],
    [[3, 1], 10],
    [[7, 0, 0, 0], 5],
    [[1, 1, 1], 1],
    [[10, 2, 4, 4, 0], 33],
    [[0], 7],
  ])("charges initiales %j et %i nouveaux : écart ≤ max(1, écart initial) et total conservé", (charges, n) => {
    const { parCommercial, ecart } = repartitionEquilibree(
      charges.map((charge, i) => ({ id: `c${i}`, charge })),
      nouveaux(n),
    );
    expect(parCommercial.reduce((s, c) => s + c.attribues.length, 0)).toBe(n);
    const ecartInitial = Math.max(...charges) - Math.min(...charges);
    expect(ecart).toBeLessThanOrEqual(Math.max(1, ecartInitial));
    // le plus chargé au départ ne reçoit rien tant que les autres ne l'ont pas rattrapé
    const total = charges.reduce((s, c) => s + c, 0) + n;
    expect(Math.max(...parCommercial.map((c) => c.total))).toBeLessThanOrEqual(Math.max(Math.ceil(total / charges.length), Math.max(...charges)));
  });

  it("le lot comble les écarts initiaux avant d'égaliser : écart exactement ≤ 1 dès que possible", () => {
    const { ecart } = repartitionEquilibree(
      [
        { id: "a", charge: 9 },
        { id: "b", charge: 0 },
      ],
      nouveaux(9),
    );
    expect(ecart).toBe(0);
    const petit = repartitionEquilibree(
      [
        { id: "a", charge: 9 },
        { id: "b", charge: 0 },
      ],
      nouveaux(3),
    );
    expect(petit.parCommercial.map((c) => c.attribues.length)).toEqual([0, 3]); // tout au moins chargé
    expect(petit.ecart).toBe(6);
  });

  it("ordre stable à égalité : le premier de la liste reçoit d'abord", () => {
    const { parCommercial } = repartitionEquilibree(
      [
        { id: "a", charge: 1 },
        { id: "b", charge: 1 },
      ],
      nouveaux(3),
    );
    expect(parCommercial.map((c) => c.attribues)).toEqual([["P1", "P3"], ["P2"]]);
  });

  it("aucun commercial : erreur s'il y a des prospects, vide sinon", () => {
    expect(() => repartitionEquilibree([], nouveaux(2))).toThrow(/Aucun commercial/);
    expect(repartitionEquilibree([], [])).toEqual({ parCommercial: [], ecart: 0 });
    expect(ecartCharge([])).toBe(0);
  });
});

describe("analyse des lignes du fichier", () => {
  it("détecte les colonnes quel que soit l'ordre, la casse ou les accents", () => {
    expect(normaliserEntete(" Téléphone ")).toBe("telephone");
    expect(detecterColonnes(["SOURCE", "Nom complet", "Téléphone"])).toEqual({ nom: "Nom complet", telephone: "Téléphone", source: "SOURCE" });
    expect(detecterColonnes(["Nom", "Tel"]).source).toBeNull();
    expect(telephoneCanonique("+212 6-12.34 56 78")).toBe("212612345678");
  });

  it("ignore et motive les lignes invalides sans faire échouer l'import", () => {
    const { valides, ignorees } = analyserLignes(
      [
        { Nom: "Ali", TELEPHONE: "0612345678", Source: "Avito" },
        { Nom: "", TELEPHONE: "0611111111", Source: "Avito" },
        { Nom: "Sans tel", TELEPHONE: "", Source: "Mubawab" },
        { Nom: "Doublon", TELEPHONE: "06 12 34 56 78", Source: "" },
        { Nom: "Connu", TELEPHONE: "0699999999", Source: "Site" },
        { Nom: "", TELEPHONE: "", Source: "" },
        { Nom: "Court", TELEPHONE: "123", Source: "Site" },
      ],
      { telephonesExistants: new Set(["0699999999"]) },
    );
    expect(valides).toEqual([{ nom: "Ali", telephone: "0612345678", source: "Avito" }]);
    expect(ignorees).toEqual([
      { ligne: 3, motif: "nom vide" },
      { ligne: 4, motif: "téléphone vide" },
      { ligne: 5, motif: "doublon du téléphone de la ligne 2" },
      { ligne: 6, motif: "téléphone déjà présent dans les prospects" },
      { ligne: 8, motif: "téléphone invalide (« 123 »)" },
    ]);
  });

  it("source facultative, colonnes nom / téléphone obligatoires", () => {
    expect(analyserLignes([{ nom: "A", tel: 612345678 }]).valides).toEqual([{ nom: "A", telephone: "612345678", source: "Non précisée" }]);
    const sans = analyserLignes([{ Prénom: "A", Ville: "Rabat" }]);
    expect(sans.valides).toEqual([]);
    expect(sans.colonnes.telephone).toBeNull();
  });
});
