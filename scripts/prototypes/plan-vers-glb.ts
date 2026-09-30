/*
 * Prototype isolé : construit un fichier .glb simple à partir du JSON rendu
 * par test-lecture-plan.ts — pour chaque pièce, une dalle de sol et quatre
 * murs extrudés (boîtes), une ouverture laissée dans le mur à l'emplacement
 * de chaque porte. Aucune dépendance : encodeur glTF 2.0 binaire minimal.
 *
 * Usage : npx tsx scripts/prototypes/plan-vers-glb.ts <plan.gemini.json> <sortie.glb> [largeur_m] [hauteur_m]
 * (largeur et hauteur réelles de l'image en mètres, par défaut 15 × 10 ; hauteur des murs 2,7 m, épaisseur 0,15 m)
 */
import { readFileSync, writeFileSync } from "node:fs";

type Piece = { nom?: string; x: number; y: number; largeur: number; hauteur: number };
type Porte = { x: number; y: number; mur?: string };
type Plan = { pieces?: Piece[]; portes?: Porte[] };

const HAUTEUR_MUR = 2.7;
const EPAISSEUR = 0.15;
const LARGEUR_PORTE = 0.9;
const HAUTEUR_PORTE = 2.1;

// --- géométrie ---------------------------------------------------------------
const positions: number[] = [];
const normales: number[] = [];
const indices: number[] = [];
const couleurs: number[] = [];

/** Boîte alignée sur les axes : x (largeur), y (hauteur, vers le haut), z (profondeur = y de l'image). */
function boite(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, couleur: [number, number, number]) {
  const faces: [number[][], number[]][] = [
    [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]],
    [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]],
    [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]],
    [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]],
    [[[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]],
    [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]],
  ];
  for (const [sommets, n] of faces) {
    const base = positions.length / 3;
    for (const s of sommets) {
      positions.push(...s);
      normales.push(...n);
      couleurs.push(...couleur, 1);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** Mur horizontal (le long de x) de xa à xb en z, troué aux portes qu'il contient. */
function murHorizontal(xa: number, xb: number, z: number, portes: number[], couleur: [number, number, number]) {
  const trous = portes.filter((px) => px > xa + LARGEUR_PORTE / 2 && px < xb - LARGEUR_PORTE / 2).sort((a, b) => a - b);
  let debut = xa;
  for (const px of trous) {
    boite(debut, 0, z - EPAISSEUR / 2, px - LARGEUR_PORTE / 2, HAUTEUR_MUR, z + EPAISSEUR / 2, couleur);
    boite(px - LARGEUR_PORTE / 2, HAUTEUR_PORTE, z - EPAISSEUR / 2, px + LARGEUR_PORTE / 2, HAUTEUR_MUR, z + EPAISSEUR / 2, couleur); // linteau
    debut = px + LARGEUR_PORTE / 2;
  }
  boite(debut, 0, z - EPAISSEUR / 2, xb, HAUTEUR_MUR, z + EPAISSEUR / 2, couleur);
}
function murVertical(za: number, zb: number, x: number, portes: number[], couleur: [number, number, number]) {
  const trous = portes.filter((pz) => pz > za + LARGEUR_PORTE / 2 && pz < zb - LARGEUR_PORTE / 2).sort((a, b) => a - b);
  let debut = za;
  for (const pz of trous) {
    boite(x - EPAISSEUR / 2, 0, debut, x + EPAISSEUR / 2, HAUTEUR_MUR, pz - LARGEUR_PORTE / 2, couleur);
    boite(x - EPAISSEUR / 2, HAUTEUR_PORTE, pz - LARGEUR_PORTE / 2, x + EPAISSEUR / 2, HAUTEUR_MUR, pz + LARGEUR_PORTE / 2, couleur);
    debut = pz + LARGEUR_PORTE / 2;
  }
  boite(x - EPAISSEUR / 2, 0, debut, x + EPAISSEUR / 2, HAUTEUR_MUR, zb, couleur);
}

function construire(plan: Plan, largeurM: number, hauteurM: number) {
  const pieces = plan.pieces ?? [];
  const portes = plan.portes ?? [];
  const px = (v: number) => v * largeurM;
  const pz = (v: number) => v * hauteurM;
  const GRIS: [number, number, number] = [0.85, 0.83, 0.8];
  const SOL: [number, number, number] = [0.93, 0.9, 0.85];
  // Dalles de sol
  pieces.forEach((p, i) => {
    const teinte = i % 2 ? SOL : [0.9, 0.88, 0.82];
    boite(px(p.x), -0.05, pz(p.y), px(p.x + p.largeur), 0, pz(p.y + p.hauteur), teinte as [number, number, number]);
  });
  // Murs : chaque pièce contribue ses quatre côtés (les murs partagés se superposent, sans gêne visuelle)
  const portesH = portes.filter((d) => d.mur !== "vertical");
  const portesV = portes.filter((d) => d.mur === "vertical");
  for (const p of pieces) {
    const x0 = px(p.x), x1 = px(p.x + p.largeur), z0 = pz(p.y), z1 = pz(p.y + p.hauteur);
    const pres = (a: number, b: number) => Math.abs(a - b) < 0.35;
    murHorizontal(x0, x1, z0, portesH.filter((d) => pres(pz(d.y), z0) && px(d.x) > x0 && px(d.x) < x1).map((d) => px(d.x)), GRIS);
    murHorizontal(x0, x1, z1, portesH.filter((d) => pres(pz(d.y), z1) && px(d.x) > x0 && px(d.x) < x1).map((d) => px(d.x)), GRIS);
    murVertical(z0, z1, x0, portesV.filter((d) => pres(px(d.x), x0) && pz(d.y) > z0 && pz(d.y) < z1).map((d) => pz(d.y)), GRIS);
    murVertical(z0, z1, x1, portesV.filter((d) => pres(px(d.x), x1) && pz(d.y) > z0 && pz(d.y) < z1).map((d) => pz(d.y)), GRIS);
  }
}

// --- encodeur GLB ------------------------------------------------------------
function glb(): Buffer {
  const pos = new Float32Array(positions);
  const nor = new Float32Array(normales);
  const col = new Float32Array(couleurs);
  const idx = new Uint32Array(indices);
  const aligner = (b: Buffer) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
  const parties = [pos, nor, col, idx].map((a) => aligner(Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
  const bin = Buffer.concat(parties);
  let offset = 0;
  const vues = parties.map((p, i) => {
    const v = { buffer: 0, byteOffset: offset, byteLength: p.length, target: i === 3 ? 34963 : 34962 };
    offset += p.length;
    return v;
  });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
  const json = {
    asset: { version: "2.0", generator: "PromoPro prototype plan-vers-glb" },
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
  const cJson = Buffer.alloc(8); cJson.writeUInt32LE(jsonBuf.length, 0); cJson.writeUInt32LE(0x4e4f534a, 4);
  const cBin = Buffer.alloc(8); cBin.writeUInt32LE(bin.length, 0); cBin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([entete, cJson, jsonBuf, cBin, bin]);
}

const [entree, sortie, largeur = "15", hauteur = "10"] = process.argv.slice(2);
if (!entree || !sortie) throw new Error("Usage : plan-vers-glb.ts <plan.gemini.json> <sortie.glb> [largeur_m] [hauteur_m]");
const plan = JSON.parse(readFileSync(entree, "utf8")) as Plan;
construire(plan, Number(largeur), Number(hauteur));
writeFileSync(sortie, glb());
console.log(`${sortie} : ${plan.pieces?.length ?? 0} pièce(s), ${plan.portes?.length ?? 0} porte(s), ${indices.length / 3} triangles, ${glb().length} octets`);
