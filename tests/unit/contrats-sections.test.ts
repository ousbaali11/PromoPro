import { describe, expect, it } from "vitest";
import {
  SECTIONS_PAR_DEFAUT,
  JETONS,
  archiverPdf,
  decrireChangementsSections,
  jetonsInconnus,
  lireHistoriquePdf,
  lireSectionsFormulaire,
  rendreSections,
  rendreTexte,
} from "@/lib/contrats-sections";

const valeurs = {
  promoteur: "Résidences Atlas",
  "promoteur.contact": " (contact@residences-atlas.ma)",
  client: "NACIRI Hamid",
  "client.piece": "CIN AB123456",
  prix: "850 000 MAD",
  echeancier: "Tranche 1 · 40 % · 340 000 MAD · 24/09/2026 · Payée\nTranche 2 · 60 % · 510 000 MAD · 24/03/2027 · En attente",
};

describe("contrat par sections : jetons de fusion", () => {
  it("remplace les jetons connus, « — » quand la valeur est vide, laisse visibles les jetons inconnus", () => {
    expect(rendreTexte("Vendeur : {{promoteur}}{{promoteur.contact}} ; prix {{ prix }}", valeurs)).toBe(
      "Vendeur : Résidences Atlas (contact@residences-atlas.ma) ; prix 850 000 MAD",
    );
    expect(rendreTexte("Adresse : {{client.adresse}}", { ...valeurs, "client.adresse": "" })).toBe("Adresse : —");
    expect(rendreTexte("{{inconnu}} et {{client}}", valeurs)).toBe("{{inconnu}} et NACIRI Hamid");
    expect(jetonsInconnus([{ titre: "T {{titre.x}}", contenu: "{{client}} {{autre}}" }], valeurs).sort()).toEqual(["autre", "titre.x"]);
  });

  it("les sections par défaut ne contiennent que des jetons documentés et couvrent parties, bien, prix, échéancier, conditions, désistement", () => {
    const connus = Object.fromEntries(JETONS.map((j) => [j.cle, "x"]));
    expect(jetonsInconnus(SECTIONS_PAR_DEFAUT, connus)).toEqual([]);
    expect(SECTIONS_PAR_DEFAUT.map((s) => s.titre)).toEqual([
      "Identité des parties",
      "Désignation du bien",
      "Prix de vente",
      "Échéancier de paiement",
      "Conditions générales",
      "Clause de désistement",
    ]);
    const rendues = rendreSections(SECTIONS_PAR_DEFAUT, { ...connus, ...valeurs });
    expect(rendues[0].contenu).toContain("Résidences Atlas");
    expect(rendues[3].contenu).toContain("Tranche 2 · 60 %");
  });
});

describe("contrat par sections : lecture du formulaire et journal", () => {
  it("lit les listes parallèles dans l'ordre affiché, refuse un titre vide ou une liste vide", () => {
    const ok = lireSectionsFormulaire(["a", ""], ["Titre A", "Nouvelle"], ["texte\r\nA", " libre "]);
    expect(ok).toEqual({ sections: [{ id: "a", titre: "Titre A", contenu: "texte\nA" }, { id: null, titre: "Nouvelle", contenu: "libre" }] });
    expect(lireSectionsFormulaire(["a"], [" "], ["x"])).toEqual({ error: "La section 1 n'a pas de titre." });
    expect(lireSectionsFormulaire([], [], [])).toEqual({ error: "Un contrat doit contenir au moins une section." });
    expect(lireSectionsFormulaire(["a", "b"], ["x"], ["y", "z"])).toEqual({ error: "Formulaire de sections incohérent." });
  });

  it("décrit ajout, suppression, modification et réordonnancement ; null si rien n'a changé", () => {
    const avant = [
      { id: "a", titre: "Parties", contenu: "p" },
      { id: "b", titre: "Prix", contenu: "x" },
      { id: "c", titre: "Conditions", contenu: "c" },
    ];
    expect(decrireChangementsSections(avant, avant.map((s) => ({ ...s })))).toBeNull();
    const apres = [
      { id: "b", titre: "Prix de vente", contenu: "x" },
      { id: "a", titre: "Parties", contenu: "p modifié" },
      { id: null, titre: "Garantie", contenu: "g" },
    ];
    expect(decrireChangementsSections(avant, apres)).toBe(
      "section « Garantie » ajoutée · section « Conditions » supprimée · section « Prix de vente » modifiée (titre « Prix » → « Prix de vente ») · section « Parties » modifiée (texte) · ordre des sections modifié",
    );
  });

  it("historique des PDF : lecture tolérante et archivage sans doublon, plus récent en premier", () => {
    expect(lireHistoriquePdf(null)).toEqual([]);
    expect(lireHistoriquePdf("pas du json")).toEqual([]);
    expect(lireHistoriquePdf('[{"url":"/api/files/contrats/a.pdf","dateGeneration":"2026-09-01T10:00:00.000Z"},{"nimporte":1}]')).toEqual([
      { url: "/api/files/contrats/a.pdf", dateGeneration: "2026-09-01T10:00:00.000Z" },
    ]);
    const h = archiverPdf([{ url: "/api/files/contrats/a.pdf", dateGeneration: "2026-09-01T10:00:00.000Z" }], "/api/files/contrats/b.pdf", new Date("2026-09-20T08:00:00Z"));
    expect(h.map((v) => v.url)).toEqual(["/api/files/contrats/b.pdf", "/api/files/contrats/a.pdf"]);
    expect(h[0].dateGeneration).toBe("2026-09-20T08:00:00.000Z");
    expect(archiverPdf(h, null, null)).toEqual(h);
  });
});
