import { describe, expect, it } from "vitest";
import { CLASSE, extraireStructure, iouRectangles, type Masque } from "@/lib/plan3d/segmentation";
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
});

describe("fournisseurs", () => {
  it("la Solution PromoPro est un fournisseur sans clé, non activable, présent dans le registre", () => {
    const d = descriptionFournisseur("PROMOPRO");
    expect(d?.necessiteCle).toBe(false);
    expect(d?.activable).toBe(false);
    expect(fournisseurPlan3d("PROMOPRO").code).toBe("PROMOPRO");
    expect(FOURNISSEURS.filter((f) => f.activable).map((f) => f.code)).toEqual(["MELTFLEX", "NEURAL4D"]);
  });
});
