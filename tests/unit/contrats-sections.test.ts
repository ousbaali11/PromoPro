import { describe, expect, it } from "vitest";
import {
  CHAMPS,
  SECTIONS_PAR_DEFAUT,
  archiverPdf,
  contientJetons,
  decrireChangementsSections,
  decrireSegments,
  lireHistoriquePdf,
  lireModeleFormulaire,
  lireModeleStocke,
  lireSectionsFormulaire,
  modeleAuFormatHerite,
  normaliserSegments,
  rendreTexte,
  resoudreModele,
  segmentsDepuisTexte,
  texteDepuisSegments,
  type Segment,
} from "@/lib/contrats-sections";

const valeurs = {
  promoteur: "Résidences Atlas",
  "promoteur.contact": " (contact@residences-atlas.ma)",
  client: "NACIRI Hamid",
  "client.piece": "CIN AB123456",
  "client.adresse": "",
  prix: "850 000 MAD",
  bien: "Appartement A01",
  echeancier: "Tranche 1 · 40 % · 340 000 MAD · 24/09/2026 · Payée\nTranche 2 · 60 % · 510 000 MAD · 24/03/2027 · En attente",
};
const t = (valeur: string): Segment => ({ type: "texte", valeur });
const c = (cle: string): Segment => ({ type: "champ", cle });

describe("modèle de contrat : segments (texte libre + champs dynamiques)", () => {
  it("résout chaque champ avec la donnée du dossier ; champ vide ou inconnu → « — » ; jamais de syntaxe à accolades", () => {
    const segments = [t("Vendeur : "), c("promoteur"), c("promoteur.contact"), t(" ; acquéreur "), c("client"), t(", demeurant "), c("client.adresse"), t(", "), c("inconnu"), t(".")];
    expect(texteDepuisSegments(segments, valeurs)).toBe("Vendeur : Résidences Atlas (contact@residences-atlas.ma) ; acquéreur NACIRI Hamid, demeurant —, —.");
    const resolues = resoudreModele(SECTIONS_PAR_DEFAUT, valeurs);
    expect(resolues.map((s) => s.titre)).toEqual(["Identité des parties", "Désignation du bien", "Prix de vente", "Échéancier de paiement", "Conditions générales", "Clause de désistement"]);
    expect(resolues[0].contenu).toContain("Le vendeur : Résidences Atlas");
    expect(resolues[3].contenu).toContain("Tranche 2 · 60 %");
    for (const s of resolues) expect(contientJetons(s.contenu), s.titre).toBe(false);
  });

  it("le jeu intégré n'utilise que des champs documentés, chacun avec un libellé humain", () => {
    const connus = new Set(CHAMPS.map((ch) => ch.cle));
    for (const s of SECTIONS_PAR_DEFAUT) for (const seg of s.segments) if (seg.type === "champ") expect(connus.has(seg.cle), seg.cle).toBe(true);
    expect(CHAMPS.find((ch) => ch.cle === "client")?.libelle).toBe("Nom du client");
    expect(CHAMPS.find((ch) => ch.cle === "prix")?.libelle).toBe("Prix du bien");
    expect(decrireSegments([t("Prix : "), c("prix")])).toBe("Prix : «Prix du bien»");
  });

  it("normalise : textes contigus fusionnés, textes vides et champs inconnus retirés", () => {
    expect(normaliserSegments([t("a"), t(""), t("b"), c("client"), c("inconnu"), t("c")])).toEqual([t("ab"), c("client"), t("c")]);
  });

  it("lit le formulaire du modèle (titres + segments JSON), refuse titre vide, JSON illisible ou segment mal formé", () => {
    const ok = lireModeleFormulaire(["Prix", "Libre"], [JSON.stringify([t("Prix : "), c("prix")]), JSON.stringify([t("texte\r\nlibre")])]);
    expect(ok).toEqual({ sections: [{ titre: "Prix", segments: [t("Prix : "), c("prix")] }, { titre: "Libre", segments: [t("texte\nlibre")] }] });
    expect(lireModeleFormulaire([" "], ["[]"])).toEqual({ error: "La section 1 n'a pas de titre." });
    expect(lireModeleFormulaire(["A"], ["{pas du json"])).toEqual({ error: "Le contenu de la section « A » est illisible." });
    expect(lireModeleFormulaire(["A"], [JSON.stringify([{ type: "autre" }])])).toEqual({ error: "Le contenu de la section « A » est illisible." });
    expect(lireModeleFormulaire([], [])).toEqual({ error: "Un modèle doit contenir au moins une section." });
  });
});

describe("migration des données héritées (jetons en texte brut)", () => {
  it("convertit un texte à jetons en segments : jetons connus → champs, inconnus → texte conservé", () => {
    expect(segmentsDepuisTexte("Vendeur : {{promoteur}}{{promoteur.contact}}, prix {{ prix }} et {{inconnu}}.")).toEqual([
      t("Vendeur : "),
      c("promoteur"),
      c("promoteur.contact"),
      t(", prix "),
      c("prix"),
      t(" et {{inconnu}}."),
    ]);
    expect(segmentsDepuisTexte("sans jeton")).toEqual([t("sans jeton")]);
    expect(segmentsDepuisTexte("")).toEqual([]);
  });

  it("lit un modèle stocké dans l'ancien format ({ titre, contenu }) comme dans le nouveau ({ titre, segments })", () => {
    const herite = JSON.stringify([{ titre: "Prix", contenu: "Le prix est {{prix}}." }]);
    expect(modeleAuFormatHerite(herite)).toBe(true);
    expect(lireModeleStocke(herite)).toEqual([{ titre: "Prix", segments: [t("Le prix est "), c("prix"), t(".")] }]);
    const nouveau = JSON.stringify([{ titre: "Prix", segments: [t("Le prix est "), c("prix"), { type: "champ", cle: "inconnu" }, t("")] }]);
    expect(modeleAuFormatHerite(nouveau)).toBe(false);
    expect(lireModeleStocke(nouveau)).toEqual([{ titre: "Prix", segments: [t("Le prix est "), c("prix")] }]);
    expect(lireModeleStocke("[]")).toBeNull();
    expect(lireModeleStocke("pas du json")).toBeNull();
    expect(lireModeleStocke(JSON.stringify([{ titre: "X" }]))).toBeNull();
  });

  it("garde-fou du PDF : un jeton résiduel est résolu, un jeton inconnu reste visible tel quel", () => {
    expect(contientJetons("Bonjour {{client}}")).toBe(true);
    expect(contientJetons("Bonjour NACIRI Hamid")).toBe(false);
    expect(rendreTexte("Bonjour {{client}}, {{client.adresse}}, {{inconnu}}", valeurs)).toBe("Bonjour NACIRI Hamid, —, {{inconnu}}");
  });
});

describe("contrat précis : texte simple, journal, historique des PDF", () => {
  it("lit les listes parallèles dans l'ordre affiché, refuse un titre vide ou une liste vide", () => {
    const ok = lireSectionsFormulaire(["a", ""], ["Titre A", "Nouvelle"], ["texte\r\nA", " libre "]);
    expect(ok).toEqual({ sections: [{ id: "a", titre: "Titre A", contenu: "texte\nA" }, { id: null, titre: "Nouvelle", contenu: "libre" }] });
    expect(lireSectionsFormulaire(["a"], [" "], ["x"])).toEqual({ error: "La section 1 n'a pas de titre." });
    expect(lireSectionsFormulaire([], [], [])).toEqual({ error: "Un contrat doit contenir au moins une section." });
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
    const h = archiverPdf([{ url: "/api/files/contrats/a.pdf", dateGeneration: "2026-09-01T10:00:00.000Z" }], "/api/files/contrats/b.pdf", new Date("2026-09-20T08:00:00Z"));
    expect(h.map((v) => v.url)).toEqual(["/api/files/contrats/b.pdf", "/api/files/contrats/a.pdf"]);
    expect(archiverPdf(h, null, null)).toEqual(h);
  });
});
