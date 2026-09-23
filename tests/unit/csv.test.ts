import { describe, expect, it } from "vitest";
import { BOM_UTF8, echapperCelluleCsv, formaterCelluleCsv, genererCsv, nomFichierCsv } from "@/lib/csv";

describe("export CSV compatible Excel", () => {
  it("commence par le BOM UTF-8, sépare par point-virgule, termine chaque ligne par CRLF", () => {
    const csv = genererCsv(["Nom", "Montant"], [["Naciri", 850000], ["Benali", 0]]);
    expect(csv.startsWith(BOM_UTF8)).toBe(true);
    expect(csv.slice(1)).toBe("Nom;Montant\r\nNaciri;850000\r\nBenali;0\r\n");
  });

  it("formate dates, booléens, nombres et valeurs vides", () => {
    expect(formaterCelluleCsv(new Date(2026, 8, 23))).toBe("23/09/2026");
    expect(formaterCelluleCsv(new Date("invalide"))).toBe("");
    expect(formaterCelluleCsv(true)).toBe("Oui");
    expect(formaterCelluleCsv(false)).toBe("Non");
    expect(formaterCelluleCsv(12.5)).toBe("12.5");
    expect(formaterCelluleCsv(Number.NaN)).toBe("");
    expect(formaterCelluleCsv(null)).toBe("");
    expect(formaterCelluleCsv(undefined)).toBe("");
  });

  it("échappe le séparateur, les guillemets et les sauts de ligne", () => {
    expect(echapperCelluleCsv("Appartement A01")).toBe("Appartement A01");
    expect(echapperCelluleCsv("SCI Al Manar; compte")).toBe('"SCI Al Manar; compte"');
    expect(echapperCelluleCsv('Résidence "Al Manar"')).toBe('"Résidence ""Al Manar"""');
    expect(echapperCelluleCsv("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
  });

  it("neutralise l'injection de formule (=, +, -, @ en tête de cellule)", () => {
    expect(echapperCelluleCsv("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(echapperCelluleCsv("+212 6 12 34 56 78")).toBe("'+212 6 12 34 56 78");
    expect(echapperCelluleCsv("-5")).toBe("'-5");
    expect(echapperCelluleCsv("@cmd")).toBe("'@cmd");
    expect(genererCsv(["x"], [["=1+1"]])).toContain("'=1+1");
  });

  it("nom de fichier daté, sans accent ni espace", () => {
    expect(nomFichierCsv("Paiements validés", new Date(2026, 8, 5))).toBe("paiements-valides-2026-09-05.csv");
    expect(nomFichierCsv("Échéances de Appartement A01", new Date(2026, 0, 1))).toBe("echeances-de-appartement-a01-2026-01-01.csv");
    expect(nomFichierCsv("   ", new Date(2026, 0, 1))).toBe("export-2026-01-01.csv");
  });
});
