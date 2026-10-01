import type { Piece, Porte } from "./segmentation";

/*
 * Extrusion d'une structure (pièces en rectangles relatifs, portes) en un
 * fichier .glb : une dalle par pièce, quatre murs par pièce (boîtes), une
 * ouverture dans le mur à chaque porte. Encodeur glTF 2.0 binaire minimal,
 * sans dépendance ; sortie lue par <model-viewer>. Fonction pure, testée dans
 * tests/unit/plan3d-extrusion.test.ts.
 */

export const HAUTEUR_MUR = 2.7;
export const EPAISSEUR_MUR = 0.15;
export const LARGEUR_PORTE = 0.9;
export const HAUTEUR_PORTE = 2.1;
/** Sans échelle connue, le grand côté du plan est supposé mesurer 15 m. */
export const GRAND_COTE_PAR_DEFAUT_M = 15;

type Couleur = [number, number, number];

class Geometrie {
  positions: number[] = [];
  normales: number[] = [];
  couleurs: number[] = [];
  indices: number[] = [];

  boite(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Couleur) {
    const faces: [number[][], number[]][] = [
      [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]],
      [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]],
      [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]],
      [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]],
      [[[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]],
      [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]],
    ];
    for (const [sommets, n] of faces) {
      const base = this.positions.length / 3;
      for (const s of sommets) {
        this.positions.push(...s);
        this.normales.push(...n);
        this.couleurs.push(...c, 1);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  murHorizontal(xa: number, xb: number, z: number, portes: number[], c: Couleur) {
    const trous = portes.filter((px) => px > xa + LARGEUR_PORTE / 2 && px < xb - LARGEUR_PORTE / 2).sort((a, b) => a - b);
    let debut = xa;
    for (const px of trous) {
      this.boite(debut, 0, z - EPAISSEUR_MUR / 2, px - LARGEUR_PORTE / 2, HAUTEUR_MUR, z + EPAISSEUR_MUR / 2, c);
      this.boite(px - LARGEUR_PORTE / 2, HAUTEUR_PORTE, z - EPAISSEUR_MUR / 2, px + LARGEUR_PORTE / 2, HAUTEUR_MUR, z + EPAISSEUR_MUR / 2, c);
      debut = px + LARGEUR_PORTE / 2;
    }
    this.boite(debut, 0, z - EPAISSEUR_MUR / 2, xb, HAUTEUR_MUR, z + EPAISSEUR_MUR / 2, c);
  }

  murVertical(za: number, zb: number, x: number, portes: number[], c: Couleur) {
    const trous = portes.filter((pz) => pz > za + LARGEUR_PORTE / 2 && pz < zb - LARGEUR_PORTE / 2).sort((a, b) => a - b);
    let debut = za;
    for (const pz of trous) {
      this.boite(x - EPAISSEUR_MUR / 2, 0, debut, x + EPAISSEUR_MUR / 2, HAUTEUR_MUR, pz - LARGEUR_PORTE / 2, c);
      this.boite(x - EPAISSEUR_MUR / 2, HAUTEUR_PORTE, pz - LARGEUR_PORTE / 2, x + EPAISSEUR_MUR / 2, HAUTEUR_MUR, pz + LARGEUR_PORTE / 2, c);
      debut = pz + LARGEUR_PORTE / 2;
    }
    this.boite(x - EPAISSEUR_MUR / 2, 0, debut, x + EPAISSEUR_MUR / 2, HAUTEUR_MUR, zb, c);
  }
}

/** Construit le .glb. `largeurM` et `hauteurM` : dimensions réelles de l'image du plan en mètres. */
export function extruderEnGlb(pieces: Piece[], portes: Porte[], largeurM: number, hauteurM: number): Buffer {
  const g = new Geometrie();
  const px = (v: number) => v * largeurM;
  const pz = (v: number) => v * hauteurM;
  const GRIS: Couleur = [0.85, 0.83, 0.8];
  pieces.forEach((p, i) => {
    const sol: Couleur = i % 2 ? [0.93, 0.9, 0.85] : [0.9, 0.88, 0.82];
    g.boite(px(p.x), -0.05, pz(p.y), px(p.x + p.largeur), 0, pz(p.y + p.hauteur), sol);
  });
  const portesH = portes.filter((d) => d.mur !== "vertical");
  const portesV = portes.filter((d) => d.mur === "vertical");
  // Une porte est rattachée au mur le plus proche : tolérance d'un peu plus qu'une épaisseur de mur,
  // plus la marge laissée par la dilatation des barrières lors de l'extraction des pièces
  const pres = (a: number, b: number) => Math.abs(a - b) < 0.6;
  for (const p of pieces) {
    const x0 = px(p.x), x1 = px(p.x + p.largeur), z0 = pz(p.y), z1 = pz(p.y + p.hauteur);
    g.murHorizontal(x0, x1, z0, portesH.filter((d) => pres(pz(d.y), z0) && px(d.x) > x0 && px(d.x) < x1).map((d) => px(d.x)), GRIS);
    g.murHorizontal(x0, x1, z1, portesH.filter((d) => pres(pz(d.y), z1) && px(d.x) > x0 && px(d.x) < x1).map((d) => px(d.x)), GRIS);
    g.murVertical(z0, z1, x0, portesV.filter((d) => pres(px(d.x), x0) && pz(d.y) > z0 && pz(d.y) < z1).map((d) => pz(d.y)), GRIS);
    g.murVertical(z0, z1, x1, portesV.filter((d) => pres(px(d.x), x1) && pz(d.y) > z0 && pz(d.y) < z1).map((d) => pz(d.y)), GRIS);
  }
  return encoderGlb(g);
}

/** Dimensions en mètres d'une image de plan dont on ne connaît pas l'échelle : le grand côté vaut GRAND_COTE_PAR_DEFAUT_M. */
export function dimensionsParDefaut(largeurPx: number, hauteurPx: number) {
  const ratio = GRAND_COTE_PAR_DEFAUT_M / Math.max(largeurPx, hauteurPx);
  return { largeurM: largeurPx * ratio, hauteurM: hauteurPx * ratio };
}

function encoderGlb(g: Geometrie): Buffer {
  const pos = new Float32Array(g.positions);
  const nor = new Float32Array(g.normales);
  const col = new Float32Array(g.couleurs);
  const idx = new Uint32Array(g.indices);
  const aligner = (b: Buffer) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
  const parties = [pos, nor, col, idx].map((a) => aligner(Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
  const bin = Buffer.concat(parties);
  let offset = 0;
  const vues = parties.map((p, i) => {
    const v = { buffer: 0, byteOffset: offset, byteLength: p.length, target: i === 3 ? 34963 : 34962 };
    offset += p.length;
    return v;
  });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  if (pos.length === 0) {
    min.fill(0);
    max.fill(0);
  }
  const json = {
    asset: { version: "2.0", generator: "PromoPro — Solution PromoPro (extrusion)" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: true }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: nor.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: col.length / 4, type: "VEC4" },
      { bufferView: 3, componentType: 5125, count: idx.length, type: "SCALAR" },
    ],
    bufferViews: vues,
    buffers: [{ byteLength: bin.length }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
  const entete = Buffer.alloc(12);
  entete.write("glTF", 0, "ascii");
  entete.writeUInt32LE(2, 4);
  entete.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const cJson = Buffer.alloc(8);
  cJson.writeUInt32LE(jsonBuf.length, 0);
  cJson.writeUInt32LE(0x4e4f534a, 4);
  const cBin = Buffer.alloc(8);
  cBin.writeUInt32LE(bin.length, 0);
  cBin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([entete, cJson, jsonBuf, cBin, bin]);
}
