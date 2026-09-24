import { describe, expect, it } from "vitest";
import {
  lireNombre,
  verifierMontant,
  verifierDateNaissance,
  verifierDateEcheance,
  verifierPourcentages,
  verifierDelaiTma,
  verifierTexte,
  LONGUEURS,
} from "@/lib/validation";

describe("montants", () => {
  it("refuse vide, zéro, négatif, NaN, infini ; accepte un positif à 2 décimales", () => {
    expect(verifierMontant(lireNombre(""))).toMatch(/obligatoire/);
    expect(verifierMontant(lireNombre("abc"))).toMatch(/obligatoire/);
    expect(verifierMontant(0)).toMatch(/strictement positif/);
    expect(verifierMontant(-5)).toMatch(/strictement positif/);
    expect(verifierMontant(Number.POSITIVE_INFINITY)).toMatch(/obligatoire/);
    expect(verifierMontant(1000)).toBeNull();
    expect(verifierMontant(1000.5)).toBeNull();
    expect(verifierMontant(1000.55)).toBeNull();
    expect(verifierMontant(lireNombre("1 000,25".replace(" ", "")))).toBeNull(); // virgule décimale acceptée
  });

  it("refuse plus de décimales que la devise n'en accepte, et un dépassement de plafond", () => {
    expect(verifierMontant(10.555)).toMatch(/2 décimales/);
    expect(verifierMontant(1e-7)).toMatch(/2 décimales/);
    expect(verifierMontant(500, { max: 400, maxLibelle: "le restant dû du bien (400 MAD)" })).toBe("Le montant dépasse le restant dû du bien (400 MAD).");
    expect(verifierMontant(400, { max: 400 })).toBeNull();
  });
});

describe("dates", () => {
  const now = new Date(2026, 8, 24, 12);
  it("date de naissance : facultative, jamais dans le futur, pas avant 1900", () => {
    expect(verifierDateNaissance("")).toBeNull();
    expect(verifierDateNaissance(null)).toBeNull();
    expect(verifierDateNaissance("1985-03-12", now)).toBeNull();
    expect(verifierDateNaissance("2026-09-24", now)).toBeNull(); // aujourd'hui (minuit) : pas dans le futur
    expect(verifierDateNaissance("2026-09-25", now)).toMatch(/futur/);
    expect(verifierDateNaissance("1899-12-31", now)).toMatch(/ancienne/);
    expect(verifierDateNaissance("pas-une-date", now)).toMatch(/invalide/);
  });

  it("date d'échéance : obligatoire, pas antérieure à aujourd'hui", () => {
    expect(verifierDateEcheance("", now)).toMatch(/obligatoire/);
    expect(verifierDateEcheance("2026-09-23", now)).toMatch(/passé/);
    expect(verifierDateEcheance("2026-09-24", now)).toBeNull();
    expect(verifierDateEcheance("2027-01-01", now)).toBeNull();
  });
});

describe("échéancier : pourcentages", () => {
  it("exige un total de 100 %, des tranches entre 0 exclu et 100, deux décimales au plus", () => {
    expect(verifierPourcentages([40, 20, 20, 20])).toBeNull();
    expect(verifierPourcentages([100])).toBeNull();
    expect(verifierPourcentages([33.33, 33.33, 33.34])).toBeNull();
    expect(verifierPourcentages([40, 20, 20, 10])).toBe("Les pourcentages totalisent 90 % au lieu de 100 %.");
    expect(verifierPourcentages([40, 20, 20, 30])).toBe("Les pourcentages totalisent 110 % au lieu de 100 %.");
    expect(verifierPourcentages([0, 50, 50])).toMatch(/entre 0 \(exclu\) et 100/);
    expect(verifierPourcentages([-10, 110])).toMatch(/entre 0/);
    expect(verifierPourcentages([33.333, 33.333, 33.334])).toMatch(/2 décimales/);
    expect(verifierPourcentages([Number.NaN, Number.NaN])).toMatch(/au moins une tranche/);
    expect(verifierPourcentages([40, Number.NaN, 60])).toBeNull(); // tranche laissée vide = ignorée
  });
});

describe("délai TMA et textes", () => {
  it("délai : entier de 1 à 3650 jours, 0 et négatif refusés avec un message clair", () => {
    expect(verifierDelaiTma(60)).toBeNull();
    expect(verifierDelaiTma(1)).toBeNull();
    expect(verifierDelaiTma(0)).toBe("Le délai des travaux modificatifs doit être d'au moins 1 jour.");
    expect(verifierDelaiTma(-3)).toMatch(/au moins 1 jour/);
    expect(verifierDelaiTma(1.5)).toMatch(/entier/);
    expect(verifierDelaiTma(Number.NaN)).toMatch(/obligatoire/);
    expect(verifierDelaiTma(5000)).toMatch(/3650/);
  });

  it("texte : obligatoire ou non, longueur bornée, contenu quelconque accepté", () => {
    expect(verifierTexte("  ", { libelle: "Le nom", max: 100, obligatoire: true })).toBe("Le nom est obligatoire.");
    expect(verifierTexte("", { libelle: "Le commentaire", max: 100 })).toBeNull();
    expect(verifierTexte("<script>alert(1)</script> 🏠 مرحبا", { libelle: "La désignation", max: LONGUEURS.designation })).toBeNull();
    expect(verifierTexte("x".repeat(5001), { libelle: "La description", max: LONGUEURS.longue })).toBe("La description ne peut pas dépasser 2000 caractères (5001 saisis).");
  });
});
