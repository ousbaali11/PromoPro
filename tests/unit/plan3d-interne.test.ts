import { describe, expect, it } from "vitest";
import { ajouterEncre, CLASSE, extraireStructure, iouRectangles, ouverturesDansLesMurs, type Masque } from "@/lib/plan3d/segmentation";
import { dimensionsParDefaut, extruderEnGlb, GRAND_COTE_PAR_DEFAUT_M } from "@/lib/plan3d/extrusion";
import { descriptionFournisseur, FOURNISSEURS } from "@/lib/plan3d/provider";
import { fournisseurPlan3d } from "@/lib/plan3d/registre";

/** Masque synthétique 200 × 120 : contour, cloison verticale à x = 100 avec une ouverture (porte) de y = 50 à 70. */
function masqueDeuxPieces(avecClassePorte: boolean): Masque {
  const W = 200, H = 120;
  const classes = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const bord = x < 6 || x >= W - 6 || y < 6 || y >= H - 6;
      const ouverture = y >= 50 && y < 70;
      const cloison = x >= 97 && x < 103 && !ouverture;
      if (bord || cloison) classes[y * W + x] = CLASSE.MUR;
      else if (avecClassePorte && x >= 97 && x < 103 && ouverture) classes[y * W + x] = CLASSE.PORTE;
    }
  return { largeur: W, hauteur: H, classes };
}

describe("segmentation : pièces et portes depuis un masque", () => {
  it("sans classe porte et sans fermeture, l'ouverture fusionne les deux pièces ; la fermeture selon l'axe les sépare sans remplir la pièce", () => {
    const m = masqueDeuxPieces(false);
    expect(extraireStructure(m, { fermeturePx: 0 }).pieces).toHaveLength(1);
    const { pieces, portes } = extraireStructure(m, { fermeturePx: 30 });
    expect(pieces).toHaveLength(2);
    expect(portes).toHaveLength(0);
    // Pièce gauche ≈ x 6..97, pièce droite ≈ x 103..194 (coordonnées relatives), ordonnées de gauche à droite
    expect(pieces[0].x).toBeLessThan(0.1);
    expect(pieces[1].x).toBeGreaterThan(0.5);
    expect(iouRectangles(pieces[0], { nom: "", x: 6 / 200, y: 6 / 120, largeur: 91 / 200, hauteur: 108 / 120 })).toBeGreaterThan(0.8);
  });

  it("avec la classe porte, l'ouverture fait barrière d'elle-même et la porte est rendue avec son orientation", () => {
    const { pieces, portes } = extraireStructure(masqueDeuxPieces(true), { fermeturePx: 0 });
    expect(pieces).toHaveLength(2);
    expect(portes).toHaveLength(1);
    expect(portes[0].mur).toBe("vertical");
    expect(portes[0].x).toBeCloseTo(0.5, 1);
    expect(portes[0].y).toBeCloseTo(0.5, 1);
  });

  it("l'extérieur (composante qui touche le bord) et les miettes sont ignorés", () => {
    const m = masqueDeuxPieces(true);
    // Une tache de fond isolée minuscule dans le mur du haut ne doit pas devenir une pièce
    m.classes[3 * m.largeur + 50] = CLASSE.FOND;
    expect(extraireStructure(m, { fermeturePx: 0 }).pieces).toHaveLength(2);
    const vide: Masque = { largeur: 50, hauteur: 50, classes: new Uint8Array(2500) };
    expect(extraireStructure(vide).pieces).toHaveLength(0);
  });
});

/** Masque 300 × 200 : contour épais ; un couloir horizontal étroit (y 80..110) entre deux murs ; une porte dans le mur bas du couloir, contre le mur de droite. */
function masqueCouloir(): Masque {
  const W = 300, H = 200;
  const classes = new Uint8Array(W * H);
  const mur = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) classes[y * W + x] = CLASSE.MUR;
  };
  mur(0, W, 0, 6); mur(0, W, H - 6, H); mur(0, 6, 0, H); mur(W - 6, W, 0, H);
  mur(6, W - 6, 74, 80); // mur haut du couloir
  mur(6, W - 36, 110, 116); // mur bas du couloir, interrompu par une porte de 30 px contre le mur de droite
  return { largeur: W, hauteur: H, classes };
}

describe("segmentation : rebouchage des portes sans remplir les pièces étroites", () => {
  it("un couloir de 30 px entre deux murs parallèles reste une pièce ; la porte au bout d'un mur est rebouchée", () => {
    // Rebouchage jusqu'à 40 px : l'ouverture de 30 px est rebouchée car le mur bas (long) la borde ;
    // le couloir (30 px entre deux murs dont les tronçons verticaux font 6 px) n'est pas rempli
    const { pieces } = extraireStructure(masqueCouloir(), { fermeturePx: 40, aireMin: 0.001 });
    expect(pieces).toHaveLength(3);
    const couloir = pieces.find((p) => Math.abs(p.y * 200 - 80) < 5);
    expect(couloir).toBeTruthy();
    expect(couloir!.hauteur * 200).toBeLessThan(40);
    expect(couloir!.largeur * 300).toBeGreaterThan(250);
  });

  it("sans rebouchage, la porte fait communiquer le couloir et la pièce du bas", () => {
    const { pieces } = extraireStructure(masqueCouloir(), { fermeturePx: 0, aireMin: 0.001 });
    expect(pieces).toHaveLength(2);
  });
});

describe("segmentation : traits sombres de l'image ajoutés au masque", () => {
  /** Image 300 × 200 à fond blanc : un trait vertical fin et long (mur fin), un arc de porte, des lettres. */
  function imageTraits(fond = 255) {
    const W = 300, H = 200;
    const gris = new Uint8Array(W * H).fill(fond);
    for (let y = 20; y < 180; y++) gris[y * W + 150] = gris[y * W + 151] = 0; // mur fin : 2 px de large, 160 px de long
    for (let t = 0; t < 400; t++) {
      // arc de porte : quart de cercle de rayon 30
      const a = (t / 400) * (Math.PI / 2);
      const x = Math.round(60 + 30 * Math.cos(a)), y = Math.round(60 + 30 * Math.sin(a));
      gris[y * W + x] = 0;
    }
    for (let k = 0; k < 6; k++) for (let y = 100; y < 107; y++) for (let x = 200 + k * 9; x < 206 + k * 9; x++) if ((x + y) % 3) gris[y * W + x] = 0; // « texte » : six lettres de 6 × 7 px (plus petites que 3 % du grand côté)
    return { W, H, gris };
  }
  const masqueVide = (W: number, H: number): Masque => ({ largeur: W, hauteur: H, classes: new Uint8Array(W * H) });

  it("garde le mur fin, écarte l'arc de porte et le texte", () => {
    const { W, H, gris } = imageTraits();
    const masque = masqueVide(W, H);
    const ajoutes = ajouterEncre(masque, gris);
    expect(ajoutes).toBe(160 * 2);
    expect(masque.classes[100 * W + 150]).toBe(CLASSE.MUR);
    expect(masque.classes[60 * W + 90]).toBe(CLASSE.FOND); // point de l'arc
    expect(masque.classes[105 * W + 202]).toBe(CLASSE.FOND); // lettre
  });

  it("n'ajoute rien sur une image sans fond clair, ni sous les barrières déjà reconnues", () => {
    const { W, H, gris } = imageTraits(180);
    expect(ajouterEncre(masqueVide(W, H), gris)).toBe(0);
    const clair = imageTraits();
    const masque = masqueVide(W, H);
    for (let y = 0; y < H; y++) masque.classes[y * W + 150] = CLASSE.MUR; // le modèle a déjà ce mur
    expect(ajouterEncre(masque, clair.gris)).toBe(0);
  });

  it("refuse une image en gris d'une autre taille que le masque", () => {
    expect(() => ajouterEncre(masqueVide(10, 10), new Uint8Array(5))).toThrow();
  });

  it("efface les classes porte et fenêtre que le modèle a posées sur du texte, sans toucher à une fenêtre dans un mur", () => {
    const { W, H, gris } = imageTraits();
    const masque = masqueVide(W, H);
    // Le modèle a pris les lettres (x 200..254, y 100..110) pour une porte, avec un halo de 3 px
    for (let y = 97; y < 113; y++) for (let x = 197; x < 257; x++) masque.classes[y * W + x] = CLASSE.PORTE;
    // Une fenêtre réelle dans le mur haut (y 0..5), loin du texte
    for (let y = 0; y < 6; y++) for (let x = 20; x < 80; x++) masque.classes[y * W + x] = CLASSE.FENETRE;
    ajouterEncre(masque, gris);
    expect(masque.classes[105 * W + 225]).toBe(CLASSE.FOND);
    expect(masque.classes[98 * W + 198]).toBe(CLASSE.FOND);
    expect(masque.classes[2 * W + 50]).toBe(CLASSE.FENETRE);
  });
});

describe("segmentation : ouvertures gardées seulement dans les murs", () => {
  it("une fenêtre bordée de mur aux deux bouts est gardée ; une « porte » qui flotte dans la pièce ou ne touche qu'un mur redevient du fond", () => {
    const W = 200, H = 100;
    const classes = new Uint8Array(W * H);
    const poser = (x0: number, x1: number, y0: number, y1: number, c: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) classes[y * W + x] = c;
    };
    poser(0, W, 0, 6, CLASSE.MUR); // mur haut
    poser(60, 100, 0, 6, CLASSE.FENETRE); // fenêtre dans le mur haut : mur à gauche (x < 60) et à droite (x ≥ 100)
    poser(0, 6, 0, H, CLASSE.MUR); // mur gauche
    poser(6, 60, 50, 56, CLASSE.PORTE); // « porte » collée au mur gauche seulement (texte le long d'un mur)
    poser(120, 160, 70, 76, CLASSE.PORTE); // « porte » au milieu de la pièce (texte)
    const filtre = ouverturesDansLesMurs({ largeur: W, hauteur: H, classes });
    expect(filtre[2 * W + 80]).toBe(CLASSE.FENETRE);
    expect(filtre[52 * W + 30]).toBe(CLASSE.FOND);
    expect(filtre[72 * W + 140]).toBe(CLASSE.FOND);
    expect(classes[52 * W + 30]).toBe(CLASSE.PORTE); // le masque d'origine n'est pas modifié
    // Et dans l'extraction : la porte flottante n'est pas comptée
    const { portes } = extraireStructure({ largeur: W, hauteur: H, classes }, { fermeturePx: 0 });
    expect(portes).toHaveLength(0);
  });
});

describe("extrusion .glb", () => {
  it("produit un glTF binaire valide (en-tête, chunks JSON et BIN alignés) avec des murs percés aux portes", () => {
    const { pieces, portes } = extraireStructure(masqueDeuxPieces(true), { fermeturePx: 0 });
    const { largeurM, hauteurM } = dimensionsParDefaut(200, 120);
    expect(largeurM).toBe(GRAND_COTE_PAR_DEFAUT_M);
    expect(hauteurM).toBeCloseTo(9, 5);
    const glb = extruderEnGlb(pieces, portes, largeurM, hauteurM);
    expect(glb.subarray(0, 4).toString("ascii")).toBe("glTF");
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const longueurJson = glb.readUInt32LE(12);
    expect(glb.readUInt32LE(16)).toBe(0x4e4f534a);
    const json = JSON.parse(glb.subarray(20, 20 + longueurJson).toString("utf8"));
    expect(json.asset.version).toBe("2.0");
    expect(json.accessors[0].count).toBeGreaterThan(0);
    expect(json.buffers[0].byteLength % 4).toBe(0);
    // Une porte → le mur vertical partagé est fendu : plus de boîtes qu'avec aucune porte
    const sansPorte = extruderEnGlb(pieces, [], largeurM, hauteurM);
    expect(glb.length).toBeGreaterThan(sansPorte.length);
  });

  it("deux pièces voisines partagent un seul mur (bords alignés, tronçons fusionnés) et les murs sont colorés autrement que le sol", () => {
    const { pieces } = extraireStructure(masqueDeuxPieces(true), { fermeturePx: 0 });
    const { largeurM, hauteurM } = dimensionsParDefaut(200, 120);
    const sommets = (glb: Buffer) => JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8")).accessors[0].count;
    // Une pièce seule : une dalle et quatre murs, soit 5 boîtes de 24 sommets
    expect(sommets(extruderEnGlb([pieces[0]], [], largeurM, hauteurM))).toBe(5 * 24);
    // Deux pièces côte à côte : deux dalles, le contour en quatre tronçons fusionnés et une seule cloison, soit 7 boîtes (et non 10)
    expect(sommets(extruderEnGlb(pieces, [], largeurM, hauteurM))).toBe(7 * 24);
    const glb = extruderEnGlb(pieces, [], largeurM, hauteurM);
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
    const bin = glb.subarray(20 + glb.readUInt32LE(12) + 8);
    const vue = json.bufferViews[json.accessors[2].bufferView];
    const couleurs = new Float32Array(bin.buffer.slice(bin.byteOffset + vue.byteOffset, bin.byteOffset + vue.byteOffset + vue.byteLength));
    const distinctes = new Set<string>();
    for (let i = 0; i < couleurs.length; i += 4) distinctes.add(Array.from(couleurs.subarray(i, i + 3)).map((v) => v.toFixed(2)).join(","));
    // Deux teintes de sol, une teinte de mur, une teinte de dessus de mur
    expect(distinctes.size).toBe(4);
  });
});

describe("fournisseurs", () => {
  it("la Solution PromoPro est un fournisseur sans clé, non activable, présent dans le registre", () => {
    const d = descriptionFournisseur("PROMOPRO");
    expect(d?.necessiteCle).toBe(false);
    expect(d?.activable).toBe(false);
    expect(fournisseurPlan3d("PROMOPRO").code).toBe("PROMOPRO");
    expect(FOURNISSEURS.filter((f) => f.activable).map((f) => f.code)).toEqual(["GEMINI", "NEURAL4D"]);
    expect(FOURNISSEURS.map((f) => f.code)).toEqual(["GEMINI", "NEURAL4D", "PROMOPRO"]);
    expect(FOURNISSEURS.filter((f) => f.modeleInterne).map((f) => f.code)).toEqual(["PROMOPRO"]);
  });
});
