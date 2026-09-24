import { describe, expect, it } from "vitest";
import { agreger, cumul, dansLaPlage, intervalles, lignesDonnees, semaineIso, total } from "@/lib/graphiques";
import { decoderPlage } from "@/lib/plage-dates";

const now = new Date(2026, 8, 24, 15, 30); // jeudi 24 septembre 2026

describe("graphiques : intervalles", () => {
  it("jour : un intervalle par jour, bornés à la plage", () => {
    const liste = intervalles(decoderPlage("7j", now), "jour");
    expect(liste.map((i) => i.cle)).toEqual(["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"]);
    expect(liste[0].libelle).toBe("18 sept.");
    expect(liste[6].fin.getHours()).toBe(23);
  });

  it("semaine : semaines ISO commençant le lundi, la première tronquée au début de la plage", () => {
    const liste = intervalles(decoderPlage("rel:-3:mois", now), "semaine"); // 24 juin → 24 sept.
    expect(liste[0].cle).toBe("2026-S26");
    expect(liste[0].debut.getDate()).toBe(24); // borné au 24 juin, pas au lundi 22
    expect(liste[0].libelle).toBe("S26 · 22 juin");
    expect(liste[liste.length - 1].cle).toBe("2026-S39");
    expect(liste.length).toBe(14);
    expect(semaineIso(new Date(2026, 0, 1))).toBe(1);
    expect(semaineIso(new Date(2026, 11, 31))).toBe(53);
  });

  it("mois : un intervalle par mois civil", () => {
    const liste = intervalles(decoderPlage("annee", now), "mois");
    expect(liste.length).toBe(12);
    expect(liste[8].libelle).toBe("sept. 2026");
    expect(liste[11].fin.getMonth()).toBe(11);
  });
});

describe("graphiques : agrégation", () => {
  const plage = decoderPlage("7j", now);
  const liste = intervalles(plage, "jour");
  const evenements = [
    { date: new Date(2026, 8, 18, 9), valeur: 100 },
    { date: new Date(2026, 8, 18, 18), valeur: 50.5 },
    { date: new Date(2026, 8, 22), valeur: 20 },
    { date: new Date(2026, 8, 25), valeur: 999 }, // hors plage
    { date: null, valeur: 999 }, // sans date
    { date: "2026-09-24T10:00:00", valeur: 1 }, // chaîne ISO acceptée
  ];

  it("compte ou somme par intervalle, ignore ce qui est hors plage ou sans date", () => {
    expect(agreger(liste, evenements)).toEqual([2, 0, 0, 0, 1, 0, 1]);
    expect(agreger(liste, evenements, "somme")).toEqual([150.5, 0, 0, 0, 20, 0, 1]);
    expect(total(agreger(liste, evenements, "somme"))).toBe(171.5);
    expect(cumul([2, 0, 1, 0.5])).toEqual([2, 2, 3, 3.5]);
    expect(dansLaPlage(new Date(2026, 8, 20), plage)).toBe(true);
    expect(dansLaPlage(new Date(2026, 8, 17, 23, 59), plage)).toBe(false);
    expect(dansLaPlage(undefined, plage)).toBe(false);
  });

  it("lignes de données recharts : une ligne par intervalle, une colonne par série", () => {
    const lignes = lignesDonnees(liste.slice(0, 2), [
      { cle: "ventes", libelle: "Ventes", valeurs: [2, 0] },
      { cle: "ca", libelle: "CA", valeurs: [150.5] },
    ]);
    expect(lignes).toEqual([
      { intervalle: "18 sept.", ventes: 2, ca: 150.5 },
      { intervalle: "19 sept.", ventes: 0, ca: 0 },
    ]);
  });
});
