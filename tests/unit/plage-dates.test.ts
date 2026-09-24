import { describe, expect, it } from "vitest";
import {
  PLAGE_PAR_DEFAUT,
  PREREGLAGES,
  codePersonnalise,
  codeRelatif,
  decoderPlage,
  granularite,
  libellePersonnalise,
  libelleRelatif,
  verifierPersonnalisee,
} from "@/lib/plage-dates";

const now = new Date(2026, 8, 24, 15, 30); // jeudi 24 septembre 2026
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("plage de dates : préréglages", () => {
  it("chaque préréglage résout une plage bornée à la journée", () => {
    const attendu: Record<string, [string, string]> = {
      aujourdhui: ["2026-09-24", "2026-09-24"],
      semaine: ["2026-09-21", "2026-09-27"],
      "7j": ["2026-09-18", "2026-09-24"],
      "30j": ["2026-08-26", "2026-09-24"],
      mois: ["2026-09-01", "2026-09-30"],
      annee: ["2026-01-01", "2026-12-31"],
      "semaine-derniere": ["2026-09-14", "2026-09-20"],
    };
    expect(PREREGLAGES.map((p) => p.code)).toEqual(Object.keys(attendu));
    for (const p of PREREGLAGES) {
      const plage = decoderPlage(p.code, now);
      expect([ymd(plage.debut), ymd(plage.fin)], p.code).toEqual(attendu[p.code]);
      expect(plage.debut.getHours(), p.code).toBe(0);
      expect(plage.fin.getHours(), p.code).toBe(23);
      expect(plage.libelle).toBe(p.libelle);
    }
  });

  it("code absent, inconnu ou invalide → 30 derniers jours", () => {
    for (const code of [undefined, null, "", "n-importe-quoi", "rel:-0:jours", "rel:-3:heures", "perso:abc_def", "perso:2026-09-24T10:00:00.000Z_2026-09-24T09:00:00.000Z"]) {
      const plage = decoderPlage(code, now);
      expect(plage.code, String(code)).toBe(PLAGE_PAR_DEFAUT);
      expect(plage.libelle).toBe("30 derniers jours");
    }
  });
});

describe("plage de dates : relatif et personnalisé", () => {
  it("relatif : derniers / prochains, accords en genre et en nombre", () => {
    expect(codeRelatif(3, "mois", "derniers")).toBe("rel:-3:mois");
    const trois = decoderPlage("rel:-3:mois", now);
    expect([ymd(trois.debut), ymd(trois.fin)]).toEqual(["2026-06-24", "2026-09-24"]);
    expect(trois.libelle).toBe("3 derniers mois");
    const deux = decoderPlage("rel:+2:semaines", now);
    expect([ymd(deux.debut), ymd(deux.fin)]).toEqual(["2026-09-24", "2026-10-08"]);
    expect(deux.libelle).toBe("2 prochaines semaines");
    expect(libelleRelatif(1, "jours", "derniers")).toBe("1 dernier jour");
    expect(libelleRelatif(1, "annees", "prochains")).toBe("1 prochaine année");
    expect(libelleRelatif(5, "annees", "derniers")).toBe("5 dernières années");
  });

  it("personnalisé : validation (fin après le début) et libellés", () => {
    const debut = new Date(2026, 8, 12, 0, 0);
    const fin = new Date(2026, 8, 24, 23, 59);
    expect(verifierPersonnalisee(debut, fin)).toBeNull();
    expect(verifierPersonnalisee(fin, debut)).toBe("La fin doit être postérieure au début.");
    expect(verifierPersonnalisee(debut, debut)).toBe("La fin doit être postérieure au début.");
    expect(verifierPersonnalisee(null, fin)).toBe("Indiquez une date de début.");
    expect(verifierPersonnalisee(debut, new Date("x"))).toBe("Indiquez une date de fin.");
    expect(libellePersonnalise(debut, fin)).toBe("12 sept. – 24 sept. 2026");
    expect(libellePersonnalise(new Date(2025, 11, 12), new Date(2026, 8, 24, 23, 59))).toBe("12 déc. 2025 – 24 sept. 2026");
    expect(libellePersonnalise(new Date(2026, 8, 24, 9, 0), new Date(2026, 8, 24, 18, 0))).toBe("24 sept. 2026, 09:00 – 18:00");
    expect(libellePersonnalise(new Date(2026, 8, 12, 8, 0), new Date(2026, 8, 24, 18, 30))).toBe("12 sept. 08:00 – 24 sept. 2026 18:30");
    const plage = decoderPlage(codePersonnalise(debut, fin), now);
    expect(plage.debut.getTime()).toBe(debut.getTime());
    expect(plage.fin.getTime()).toBe(fin.getTime());
    expect(plage.libelle).toBe("12 sept. – 24 sept. 2026");
  });

  it("granularité des graphiques : jour jusqu'à 31 jours, semaine jusqu'à 190, mois au-delà", () => {
    expect(granularite(decoderPlage("7j", now))).toBe("jour");
    expect(granularite(decoderPlage("mois", now))).toBe("jour");
    expect(granularite(decoderPlage("rel:-3:mois", now))).toBe("semaine");
    expect(granularite(decoderPlage("annee", now))).toBe("mois");
  });
});
