import { describe, expect, it } from "vitest";
import { analyserLignesBiens, detecterColonnesBien, normaliserTexte, resoudreNature } from "@/lib/biens-import";

describe("import Excel des biens : colonnes et natures", () => {
  it("détecte les colonnes malgré accents, casse, espaces et alias, dans un ordre libre", () => {
    const colonnes = detecterColonnesBien(["Surface (m²)", "PRIX", "Type de bien", " Désignation "]);
    expect(colonnes).toEqual({ designation: " Désignation ", nature: "Type de bien", prix: "PRIX", surface: "Surface (m²)" });
    expect(detecterColonnesBien(["Lot", "Nature", "Montant", "Superficie"]).designation).toBe("Lot");
    expect(detecterColonnesBien(["nom", "nature", "prix"]).surface).toBeNull();
  });

  it("résout une nature saisie à la main vers la valeur canonique, et refuse tout ce qui n'est pas dans la liste", () => {
    expect(resoudreNature("appartement")).toBe("Appartement");
    expect(resoudreNature("  VILLA ")).toBe("Villa");
    expect(resoudreNature("place de parking couverte")).toBe("Place de parking couverte");
    expect(resoudreNature("Café ou restaurant")).toBe("Café ou restaurant");
    expect(resoudreNature("cafe ou  restaurant")).toBe("Café ou restaurant");
    expect(resoudreNature("Château")).toBeNull();
    expect(resoudreNature("Appart")).toBeNull();
    expect(resoudreNature("")).toBeNull();
    expect(normaliserTexte("  Maison   de Ville ")).toBe("maison de ville");
  });
});

describe("import Excel des biens : analyse des lignes", () => {
  const lignes = [
    { Désignation: "Garage G1", Nature: "garage", Prix: "80 000", Surface: "18" },
    { Désignation: "Appartement B12", Nature: "Appartement", Prix: "1 250 000,50", Surface: "95,5" },
    { Désignation: "", Nature: "Villa", Prix: "3000000", Surface: "250" },
    { Désignation: "Villa V3", Nature: "Château", Prix: "3000000", Surface: "250" },
    { Désignation: "Duplex D4", Nature: "Duplex", Prix: "0", Surface: "120" },
    { Désignation: "Maison M5", Nature: "Maison", Prix: "900000", Surface: "" },
    { Désignation: "garage g1", Nature: "Garage", Prix: "85000", Surface: "18" },
    { Désignation: "Studio S7", Nature: "Studio", Prix: "abc", Surface: "30" },
    { Désignation: "", Nature: "", Prix: "", Surface: "" },
    { Désignation: "Appartement A01", Nature: "Appartement", Prix: "700000", Surface: "70" },
    { Désignation: "Loft L9", Nature: "loft", Prix: "1500000.123", Surface: "140" },
  ];

  it("garde les lignes valides (nature canonisée, nombres lus avec espaces et virgules) et ignore les autres avec un motif et leur numéro de ligne", () => {
    const { valides, ignorees } = analyserLignesBiens(lignes, { designationsExistantes: new Set(["appartement a01"]) });
    expect(valides).toEqual([
      { designation: "Garage G1", nature: "Garage", prix: 80000, surface: 18 },
      { designation: "Appartement B12", nature: "Appartement", prix: 1250000.5, surface: 95.5 },
    ]);
    expect(ignorees).toEqual([
      { ligne: 4, motif: "désignation vide" },
      { ligne: 5, motif: "nature non reconnue (« Château ») : choisissez-la dans la liste des natures de biens" },
      { ligne: 6, motif: "prix invalide (« 0 »)" },
      { ligne: 7, motif: "surface vide" },
      { ligne: 8, motif: "doublon de la désignation de la ligne 2" },
      { ligne: 9, motif: "prix invalide (« abc »)" },
      { ligne: 11, motif: "désignation déjà présente dans le projet" },
      { ligne: 12, motif: "prix invalide (« 1500000.123 »)" },
    ]);
  });

  it("sans l'une des quatre colonnes, rien n'est analysé et les colonnes manquantes sont signalées", () => {
    const { valides, ignorees, colonnes } = analyserLignesBiens([{ Désignation: "X", Prix: "1", Surface: "1" }]);
    expect(valides).toEqual([]);
    expect(ignorees).toEqual([]);
    expect(colonnes.nature).toBeNull();
  });

  it("premiereLigne permet de renuméroter quand on réanalyse un aperçu (pas de ligne d'en-têtes)", () => {
    const { ignorees } = analyserLignesBiens([{ designation: "A", nature: "Garage", prix: "1", surface: "1" }, { designation: "a", nature: "Garage", prix: "1", surface: "1" }], { premiereLigne: 1 });
    expect(ignorees).toEqual([{ ligne: 2, motif: "doublon de la désignation de la ligne 1" }]);
  });
});
