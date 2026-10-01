import { describe, expect, it } from "vitest";
import { ecrireGlb, lireGlb } from "@/lib/plan3d/glb";
import { appliquerPalette, enLineaire, PALETTE } from "@/lib/plan3d/palette";

/** .glb minimal sans couleur : un sol (quad vers le haut, y = 0), un dessus de mur (quad vers le haut, y = 2,7), un mur (quad vers +x). */
function glbSansCouleur(options: { texture?: boolean; sansMateriau?: boolean } = {}) {
  const positions = [
    [0, 0, 0], [4, 0, 0], [4, 0, 4], [0, 0, 4], // sol
    [0, 2.7, 0], [1, 2.7, 0], [1, 2.7, 4], [0, 2.7, 4], // dessus de mur
    [1, 0, 0], [1, 2.7, 0], [1, 2.7, 4], [1, 0, 4], // face de mur
  ];
  const normales = [...Array(4).fill([0, 1, 0]), ...Array(4).fill([0, 1, 0]), ...Array(4).fill([1, 0, 0])];
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11];
  const pos = Buffer.from(new Float32Array(positions.flat()).buffer);
  const nor = Buffer.from(new Float32Array(normales.flat()).buffer);
  const idx = Buffer.from(new Uint16Array(indices).buffer);
  const bin = Buffer.concat([pos, nor, idx]);
  const materiau = options.texture ? { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } } : { pbrMetallicRoughness: { baseColorFactor: [0.2, 0.2, 0.2, 1] } };
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, ...(options.sansMateriau ? {} : { material: 0 }) }] }],
    ...(options.sansMateriau ? {} : { materials: [materiau] }),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 12, type: "VEC3", min: [0, 0, 0], max: [4, 2.7, 4] },
      { bufferView: 1, componentType: 5126, count: 12, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 18, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length, byteLength: nor.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nor.length, byteLength: idx.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  return ecrireGlb(json, bin);
}

function couleursDe(glb: Buffer): number[][] {
  const lu = lireGlb(glb)!;
  const doc = lu.json as { meshes: { primitives: { attributes: Record<string, number> }[] }[]; accessors: { bufferView: number; count: number }[]; bufferViews: { byteOffset: number; byteLength: number }[] };
  const a = doc.accessors[doc.meshes[0].primitives[0].attributes.COLOR_0];
  const vue = doc.bufferViews[a.bufferView];
  const flottants = new Float32Array(lu.bin.buffer.slice(lu.bin.byteOffset + vue.byteOffset, lu.bin.byteOffset + vue.byteOffset + vue.byteLength));
  return Array.from({ length: a.count }, (_, i) => Array.from(flottants.subarray(i * 3, i * 3 + 3)));
}

function attendreCouleur(reel: number[], attendu: number[]) {
  for (let k = 0; k < 3; k++) expect(reel[k]).toBeCloseTo(attendu[k], 4);
}

describe("palette commune des modèles 3D", () => {
  it("colore un maillage sans couleur selon l'orientation et la hauteur : sol, dessus de mur, mur (en linéaire) ; le matériau devient neutre", () => {
    const original = glbSansCouleur();
    const colore = appliquerPalette(original);
    expect(colore).not.toBe(original);
    const lu = lireGlb(colore)!;
    expect(lu.json).toBeTruthy();
    const couleurs = couleursDe(colore);
    expect(couleurs).toHaveLength(12);
    for (let i = 0; i < 4; i++) attendreCouleur(couleurs[i], enLineaire(PALETTE.solA));
    for (let i = 4; i < 8; i++) attendreCouleur(couleurs[i], enLineaire(PALETTE.dessusMur));
    for (let i = 8; i < 12; i++) attendreCouleur(couleurs[i], enLineaire(PALETTE.mur));
    const materiaux = (lu.json as { materials: { pbrMetallicRoughness: { baseColorFactor: number[]; metallicFactor: number } }[] }).materials;
    expect(materiaux[0].pbrMetallicRoughness.baseColorFactor).toEqual([1, 1, 1, 1]);
    expect(materiaux[0].pbrMetallicRoughness.metallicFactor).toBe(0);
    // Le fichier reste un .glb cohérent : longueur annoncée, chunk binaire aligné
    expect(colore.readUInt32LE(8)).toBe(colore.length);
    expect((lu.json as { buffers: { byteLength: number }[] }).buffers[0].byteLength % 4).toBe(0);
  });

  it("une primitive sans matériau en reçoit un, neutre, pour que les couleurs de sommets s'affichent telles quelles", () => {
    const colore = appliquerPalette(glbSansCouleur({ sansMateriau: true }));
    const doc = lireGlb(colore)!.json as { meshes: { primitives: { material?: number }[] }[]; materials: { pbrMetallicRoughness: { metallicFactor: number } }[] };
    expect(doc.meshes[0].primitives[0].material).toBe(0);
    expect(doc.materials[0].pbrMetallicRoughness.metallicFactor).toBe(0);
  });

  it("ne touche ni un maillage texturé, ni un fichier qui n'est pas un .glb", () => {
    const texture = glbSansCouleur({ texture: true });
    expect(appliquerPalette(texture)).toBe(texture);
    const autre = Buffer.from("pas un glb");
    expect(appliquerPalette(autre)).toBe(autre);
    const tronque = glbSansCouleur().subarray(0, 40);
    expect(appliquerPalette(tronque)).toBe(tronque);
  });

  it("les teintes sont claires et chaudes : sol en bois clair, murs crème plus clairs que le sol, dessus de mur nettement plus sombre", () => {
    const luminosite = (c: number[]) => (c[0] + c[1] + c[2]) / 3;
    expect(luminosite(PALETTE.mur)).toBeGreaterThan(luminosite(PALETTE.solA));
    expect(luminosite(PALETTE.solA)).toBeGreaterThan(0.65);
    expect(luminosite(PALETTE.dessusMur)).toBeLessThan(luminosite(PALETTE.solA) - 0.2);
    for (const c of [PALETTE.solA, PALETTE.solB]) expect(c[0]).toBeGreaterThan(c[2]); // rouge > bleu : teinte brune
  });

  it("la conversion sRGB → linéaire assombrit les valeurs intermédiaires et laisse 0 et 1 inchangés", () => {
    attendreCouleur(enLineaire([0, 0.5, 1]), [0, 0.2140, 1]);
  });
});
