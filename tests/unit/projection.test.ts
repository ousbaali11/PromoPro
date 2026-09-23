import { describe, expect, it } from "vitest";
import { projeterEcheances, restantDu, type EcheanceProjetable } from "@/lib/projection";

const now = new Date(2026, 8, 24, 15, 30); // 24 septembre 2026
const dans = (jours: number, heure = 10) => new Date(2026, 8, 24 + jours, heure);
const e = (id: string, jours: number, montant: number, montantPaye = 0, projet = "Al Manar", statut = "EN_ATTENTE"): EcheanceProjetable => ({
  id,
  montant,
  montantPaye,
  statut,
  dateEcheance: dans(jours),
  segmentCle: projet.toLowerCase(),
  segmentLibelle: projet,
});

describe("trésorerie prévisionnelle : projection à 30 / 60 / 90 jours", () => {
  it("restant dû : montant moins payé, jamais négatif, zéro si soldée", () => {
    expect(restantDu({ montant: 100, montantPaye: 30, statut: "EN_ATTENTE" })).toBe(70);
    expect(restantDu({ montant: 100, montantPaye: 130, statut: "EN_ATTENTE" })).toBe(0);
    expect(restantDu({ montant: 100, montantPaye: 0, statut: "PAYEE" })).toBe(0);
  });

  it("trois fenêtres consécutives, aujourd'hui inclus dans la première, bornes à 30 / 60 / 90 jours", () => {
    const p = projeterEcheances([e("a", 0, 100), e("b", 30, 200), e("c", 31, 300), e("d", 60, 400), e("e", 61, 500), e("f", 90, 600), e("g", 91, 700)], now);
    expect(p.fenetres.map((f) => f.libelle)).toEqual(["0–30 j", "31–60 j", "61–90 j"]);
    expect(p.fenetres.map((f) => f.total)).toEqual([300, 700, 1100]);
    expect(p.fenetres.map((f) => f.nombre)).toEqual([2, 2, 2]);
    expect(p.total).toBe(2100);
    expect(p.auDela).toEqual({ nombre: 1, montant: 700 });
    expect(p.enRetard).toEqual({ nombre: 0, montant: 0 });
  });

  it("ignore les échéances soldées et compte le reste à percevoir des partielles", () => {
    const p = projeterEcheances([e("a", 5, 1000, 1000, "X", "PAYEE"), e("b", 5, 1000, 250), e("c", 5, 500, 0, "X", "PAYEE")], now);
    expect(p.total).toBe(750);
    expect(p.fenetres[0].nombre).toBe(1);
  });

  it("les échéances en retard sortent de la projection et sont signalées à part", () => {
    const p = projeterEcheances([e("a", -1, 900), e("b", -40, 100, 50), e("c", 2, 300)], now);
    expect(p.enRetard).toEqual({ nombre: 2, montant: 950 });
    expect(p.total).toBe(300);
  });

  it("empile par projet, segments triés par montant décroissant, légende globale", () => {
    const p = projeterEcheances([e("a", 3, 100, 0, "Al Manar"), e("b", 4, 900, 0, "Les Palmiers"), e("c", 40, 50, 0, "Al Manar"), e("d", 70, 10, 0, "Zénith")], now);
    expect(p.fenetres[0].segments).toEqual([
      { cle: "les palmiers", libelle: "Les Palmiers", montant: 900 },
      { cle: "al manar", libelle: "Al Manar", montant: 100 },
    ]);
    expect(p.fenetres[1].segments).toEqual([{ cle: "al manar", libelle: "Al Manar", montant: 50 }]);
    expect(p.segments.map((s) => `${s.libelle}=${s.montant}`)).toEqual(["Les Palmiers=900", "Al Manar=150", "Zénith=10"]);
    expect(p.total).toBe(1060);
  });

  it("sans échéance : fenêtres vides, totaux à zéro", () => {
    const p = projeterEcheances([], now);
    expect(p.total).toBe(0);
    expect(p.fenetres.every((f) => f.total === 0 && f.segments.length === 0)).toBe(true);
    expect(p.segments).toEqual([]);
  });
});
