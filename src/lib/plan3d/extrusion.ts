import type { Piece, Porte } from "./segmentation";

/*
 * Extrusion d'une structure (pièces en rectangles relatifs, portes) en un
 * fichier .glb : une dalle par pièce, des murs partagés entre pièces voisines,
 * une ouverture dans le mur à chaque porte. Les bords des pièces sont d'abord
 * alignés (les rectangles issus de la segmentation ne se touchent pas : la
 * dilatation des barrières laisse l'épaisseur du mur entre eux) ; chaque ligne
 * de mur n'est construite qu'une fois, les tronçons qui se recouvrent étant
 * fusionnés. Couleurs : sol clair (deux teintes alternées), murs gris plus
 * sombres, dessus des murs encore plus sombre pour que le plan reste lisible
 * vu de dessus. Encodeur glTF 2.0 binaire minimal, sans dépendance ; sortie
 * lue par <model-viewer>. Fonction pure, testée dans tests/unit/plan3d-interne.test.ts.
 */

export const HAUTEUR_MUR = 2.7;
export const EPAISSEUR_MUR = 0.15;
export const LARGEUR_PORTE = 0.9;
export const HAUTEUR_PORTE = 2.1;
/** Sans échelle connue, le grand côté du plan est supposé mesurer 15 m. */
export const GRAND_COTE_PAR_DEFAUT_M = 15;
/** Deux bords de pièces du même côté plus proches que cette distance (en mètres) sont sur la même ligne de mur. */
export const TOLERANCE_ALIGNEMENT_M = 0.5;
/** Jour maximal entre deux pièces qui se font face pour n'être qu'un seul mur, en fraction du grand côté du plan. */
export const ECART_MUR_RELATIF = 0.07;

type Couleur = [number, number, number];
const SOL_A: Couleur = [0.87, 0.8, 0.68];
const SOL_B: Couleur = [0.78, 0.71, 0.59];
const MUR: Couleur = [0.6, 0.59, 0.57];
const DESSUS_MUR: Couleur = [0.3, 0.31, 0.34];

class Geometrie {
  positions: number[] = [];
  normales: number[] = [];
  couleurs: number[] = [];
  indices: number[] = [];

  /** Boîte alignée sur les axes ; `dessus` colore la face supérieure (y = y1) si elle diffère des côtés. */
  boite(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Couleur, dessus: Couleur = c) {
    const faces: [number[][], number[], Couleur][] = [
      [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], c],
      [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], c],
      [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], c],
      [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], c],
      [[[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], dessus],
      [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], c],
    ];
    for (const [sommets, n, couleur] of faces) {
      const base = this.positions.length / 3;
      for (const s of sommets) {
        this.positions.push(...s);
        this.normales.push(...n);
        this.couleurs.push(...couleur, 1);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  murHorizontal(xa: number, xb: number, z: number, portes: number[], c: Couleur) {
    const trous = portes.filter((px) => px > xa + LARGEUR_PORTE / 2 && px < xb - LARGEUR_PORTE / 2).sort((a, b) => a - b);
    let debut = xa;
    for (const px of trous) {
      this.boite(debut, 0, z - EPAISSEUR_MUR / 2, px - LARGEUR_PORTE / 2, HAUTEUR_MUR, z + EPAISSEUR_MUR / 2, c, DESSUS_MUR);
      this.boite(px - LARGEUR_PORTE / 2, HAUTEUR_PORTE, z - EPAISSEUR_MUR / 2, px + LARGEUR_PORTE / 2, HAUTEUR_MUR, z + EPAISSEUR_MUR / 2, c, DESSUS_MUR);
      debut = px + LARGEUR_PORTE / 2;
    }
    this.boite(debut, 0, z - EPAISSEUR_MUR / 2, xb, HAUTEUR_MUR, z + EPAISSEUR_MUR / 2, c, DESSUS_MUR);
  }

  murVertical(za: number, zb: number, x: number, portes: number[], c: Couleur) {
    const trous = portes.filter((pz) => pz > za + LARGEUR_PORTE / 2 && pz < zb - LARGEUR_PORTE / 2).sort((a, b) => a - b);
    let debut = za;
    for (const pz of trous) {
      this.boite(x - EPAISSEUR_MUR / 2, 0, debut, x + EPAISSEUR_MUR / 2, HAUTEUR_MUR, pz - LARGEUR_PORTE / 2, c, DESSUS_MUR);
      this.boite(x - EPAISSEUR_MUR / 2, HAUTEUR_PORTE, pz - LARGEUR_PORTE / 2, x + EPAISSEUR_MUR / 2, HAUTEUR_MUR, pz + LARGEUR_PORTE / 2, c, DESSUS_MUR);
      debut = pz + LARGEUR_PORTE / 2;
    }
    this.boite(x - EPAISSEUR_MUR / 2, 0, debut, x + EPAISSEUR_MUR / 2, HAUTEUR_MUR, zb, c, DESSUS_MUR);
  }
}

type Rectangle = { x0: number; x1: number; z0: number; z1: number };
type Bord = { valeur: number; piece: number; cote: 0 | 1 };

/**
 * Regroupe des bords de pièces sur une même ligne de mur et rend la valeur
 * commune (moyenne) de chaque groupe. Deux bords de pièces différentes sont
 * réunis s'ils se font face (fin d'une pièce, début de la suivante) à moins de
 * `ecartMur` — l'épaisseur du mur plus la marge laissée par la dilatation des
 * barrières —, ou s'ils sont du même côté à moins de `TOLERANCE_ALIGNEMENT_M`
 * (bords extérieurs d'un même mur de façade). Les deux bords d'une même pièce
 * ne sont jamais réunis directement : une pièce étroite garde sa largeur.
 */
function aligner(bords: Bord[], ecartMur: number): number[] {
  const parent = bords.map((_, i) => i);
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
  for (let i = 0; i < bords.length; i++)
    for (let j = i + 1; j < bords.length; j++) {
      const a = bords[i], b = bords[j];
      if (a.piece === b.piece) continue;
      const ecart = Math.abs(a.valeur - b.valeur);
      const seFontFace = a.cote !== b.cote && ecart <= ecartMur;
      const memeCote = a.cote === b.cote && ecart <= TOLERANCE_ALIGNEMENT_M;
      if (seFontFace || memeCote) parent[racine(i)] = racine(j);
    }
  const groupes = new Map<number, number[]>();
  bords.forEach((b, i) => {
    const r = racine(i);
    groupes.set(r, [...(groupes.get(r) ?? []), b.valeur]);
  });
  return bords.map((_, i) => {
    const g = groupes.get(racine(i))!;
    return g.reduce((somme, v) => somme + v, 0) / g.length;
  });
}

/** Pièces en mètres, bords alignés sur les lignes de murs communes ; une pièce qui s'effondrerait garde ses bords d'origine. */
function rectanglesAlignes(pieces: Piece[], largeurM: number, hauteurM: number): Rectangle[] {
  const bruts = pieces.map((p) => ({ x0: p.x * largeurM, x1: (p.x + p.largeur) * largeurM, z0: p.y * hauteurM, z1: (p.y + p.hauteur) * hauteurM }));
  // Jour laissé entre deux pièces voisines par la segmentation : épaisseur du mur et dilatation des barrières, proportionnel au plan
  const ecartMur = Math.max(TOLERANCE_ALIGNEMENT_M, ECART_MUR_RELATIF * Math.max(largeurM, hauteurM));
  const xs = aligner(bruts.flatMap((r, piece) => [{ valeur: r.x0, piece, cote: 0 as const }, { valeur: r.x1, piece, cote: 1 as const }]), ecartMur);
  const zs = aligner(bruts.flatMap((r, piece) => [{ valeur: r.z0, piece, cote: 0 as const }, { valeur: r.z1, piece, cote: 1 as const }]), ecartMur);
  return bruts.map((r, i) => {
    const a = { x0: xs[2 * i], x1: xs[2 * i + 1], z0: zs[2 * i], z1: zs[2 * i + 1] };
    return a.x1 - a.x0 > TOLERANCE_ALIGNEMENT_M && a.z1 - a.z0 > TOLERANCE_ALIGNEMENT_M ? a : r;
  });
}

/** Tronçons [a, b] sur une même ligne, fusionnés dès qu'ils se touchent ou se recouvrent. */
function fusionnerTroncons(troncons: [number, number][]): [number, number][] {
  const tri = [...troncons].sort((p, q) => p[0] - q[0]);
  const resultat: [number, number][] = [];
  for (const [a, b] of tri) {
    const dernier = resultat[resultat.length - 1];
    if (dernier && a <= dernier[1] + 1e-6) dernier[1] = Math.max(dernier[1], b);
    else resultat.push([a, b]);
  }
  return resultat;
}

/** Lignes de murs (horizontales : clé z ; verticales : clé x), chaque ligne portant ses tronçons fusionnés. */
function lignesDeMurs(rectangles: Rectangle[]) {
  const horizontales = new Map<number, [number, number][]>();
  const verticales = new Map<number, [number, number][]>();
  const ajouter = (carte: Map<number, [number, number][]>, cle: number, troncon: [number, number]) => {
    const liste = carte.get(cle) ?? [];
    liste.push(troncon);
    carte.set(cle, liste);
  };
  for (const r of rectangles) {
    ajouter(horizontales, r.z0, [r.x0, r.x1]);
    ajouter(horizontales, r.z1, [r.x0, r.x1]);
    ajouter(verticales, r.x0, [r.z0, r.z1]);
    ajouter(verticales, r.x1, [r.z0, r.z1]);
  }
  return {
    horizontales: [...horizontales].map(([z, t]) => ({ z, troncons: fusionnerTroncons(t) })),
    verticales: [...verticales].map(([x, t]) => ({ x, troncons: fusionnerTroncons(t) })),
  };
}

/** Construit le .glb. `largeurM` et `hauteurM` : dimensions réelles de l'image du plan en mètres. */
export function extruderEnGlb(pieces: Piece[], portes: Porte[], largeurM: number, hauteurM: number): Buffer {
  const g = new Geometrie();
  const px = (v: number) => v * largeurM;
  const pz = (v: number) => v * hauteurM;
  const rectangles = rectanglesAlignes(pieces, largeurM, hauteurM);
  // Dalles : les rectangles alignés se rejoignent sous le mur, sans jour entre deux pièces ;
  // deux teintes alternées pour distinguer les pièces voisines
  rectangles.forEach((r, i) => g.boite(r.x0, -0.05, r.z0, r.x1, 0, r.z1, i % 2 ? SOL_B : SOL_A));
  const portesH = portes.filter((d) => d.mur !== "vertical");
  const portesV = portes.filter((d) => d.mur === "vertical");
  // Une porte est rattachée au mur le plus proche : tolérance d'un peu plus qu'une épaisseur de mur,
  // plus la marge laissée par la dilatation des barrières lors de l'extraction des pièces
  const pres = (a: number, b: number) => Math.abs(a - b) < 0.6;
  const { horizontales, verticales } = lignesDeMurs(rectangles);
  for (const { z, troncons } of horizontales)
    for (const [xa, xb] of troncons)
      g.murHorizontal(xa, xb, z, portesH.filter((d) => pres(pz(d.y), z) && px(d.x) > xa && px(d.x) < xb).map((d) => px(d.x)), MUR);
  for (const { x, troncons } of verticales)
    for (const [za, zb] of troncons)
      g.murVertical(za, zb, x, portesV.filter((d) => pres(px(d.x), x) && pz(d.y) > za && pz(d.y) < zb).map((d) => pz(d.y)), MUR);
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
