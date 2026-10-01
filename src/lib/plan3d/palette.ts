import { aligner4, ecrireGlb, lireGlb } from "./glb";

/*
 * Palette commune des modèles 3D générés : tons clairs de maquette
 * d'architecture — sol en bois clair (deux teintes pour distinguer les pièces
 * voisines), murs crème, dessus des murs brun moyen pour que le plan reste
 * lisible vu de dessus. Utilisée par l'extrusion interne (Solution PromoPro)
 * et appliquée après coup aux modèles des fournisseurs qui le demandent
 * (drapeau `recolorer` de FOURNISSEURS) : leurs maillages arrivent sans
 * couleur, et chaque sommet reçoit sa teinte selon l'orientation de sa face
 * (vers le haut et au niveau du sol → sol ; vers le haut et plus haut → dessus
 * de mur ; sinon → mur). Un maillage déjà texturé n'est pas touché, et tout
 * imprévu rend le modèle d'origine : la couleur ne fait jamais échouer une
 * génération.
 */

export type Couleur = [number, number, number];

/** Teintes telles qu'elles doivent apparaître à l'écran (sRGB, 0 à 1). */
export const PALETTE = {
  solA: [0.86, 0.72, 0.55] as Couleur,
  solB: [0.91, 0.8, 0.65] as Couleur,
  mur: [0.9, 0.87, 0.82] as Couleur,
  dessusMur: [0.5, 0.44, 0.38] as Couleur,
};

/**
 * glTF interprète les couleurs de sommets (COLOR_0) en espace linéaire : une
 * teinte sRGB écrite telle quelle s'affiche nettement plus claire (0,5 sRGB
 * devient 0,73 à l'écran). Conversion sRGB → linéaire avant écriture.
 */
export function enLineaire(c: Couleur): Couleur {
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))) as Couleur;
}

/** Face tournée vers le haut (composante y de la normale) au-delà de ce seuil. */
const SEUIL_HAUT = 0.5;
/** Fraction de la hauteur du modèle en dessous de laquelle une face vers le haut est du sol. */
const FRACTION_SOL = 0.15;

type Accesseur = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown };
type VueTampon = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number };
type Primitive = { attributes: Record<string, number>; material?: number };
type Materiau = { pbrMetallicRoughness?: { baseColorTexture?: unknown; baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number } };
type Document = {
  meshes?: { primitives: Primitive[] }[];
  accessors?: Accesseur[];
  bufferViews?: VueTampon[];
  buffers?: { byteLength: number; uri?: string }[];
  materials?: Materiau[];
};

/** Lit un accesseur VEC3 de flottants du tampon binaire ; null s'il est d'un autre format (entrelacé pris en charge). */
function lireVec3(doc: Document, bin: Buffer, index: number): Float32Array | null {
  const a = doc.accessors?.[index];
  if (!a || a.type !== "VEC3" || a.componentType !== 5126 || a.sparse || a.bufferView === undefined) return null;
  const vue = doc.bufferViews?.[a.bufferView];
  if (!vue || vue.buffer !== 0) return null;
  const pas = vue.byteStride ?? 12;
  const debut = (vue.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (debut + (a.count - 1) * pas + 12 > bin.length) return null;
  const resultat = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) {
    const o = debut + i * pas;
    resultat[i * 3] = bin.readFloatLE(o);
    resultat[i * 3 + 1] = bin.readFloatLE(o + 4);
    resultat[i * 3 + 2] = bin.readFloatLE(o + 8);
  }
  return resultat;
}

/**
 * Applique la palette à un .glb : ajoute un attribut COLOR_0 par primitive
 * (sol, mur ou dessus de mur selon la normale et la hauteur) et neutralise la
 * couleur de base du matériau. Rend le tampon d'origine si le fichier n'est
 * pas un .glb exploitable ou si rien n'a pu être recoloré.
 */
export function appliquerPalette<T extends Buffer<ArrayBufferLike>>(octets: T): T {
  try {
    const glb = lireGlb(octets);
    if (!glb) return octets;
    const doc = glb.json as Document;
    if (!doc.meshes?.length || !doc.accessors || !doc.bufferViews || doc.buffers?.[0]?.uri) return octets;
    const bin = glb.bin;
    const vues = [...doc.bufferViews];
    const accesseurs = [...doc.accessors];
    const ajouts: Buffer[] = [];
    let longueurBin = aligner4(bin).length;
    const materiauxRecolores = new Set<number>();
    const materiaux = [...(doc.materials ?? [])];
    let recolore = false;
    const meshes = doc.meshes.map((mesh) => ({
      ...mesh,
      primitives: mesh.primitives.map((prim) => {
        const materiau = prim.material !== undefined ? doc.materials?.[prim.material] : undefined;
        if (materiau?.pbrMetallicRoughness?.baseColorTexture) return prim;
        if (prim.attributes.POSITION === undefined || prim.attributes.NORMAL === undefined) return prim;
        const positions = lireVec3(doc, bin, prim.attributes.POSITION);
        const normales = lireVec3(doc, bin, prim.attributes.NORMAL);
        if (!positions || !normales || positions.length !== normales.length) return prim;
        const n = positions.length / 3;
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < n; i++) {
          yMin = Math.min(yMin, positions[i * 3 + 1]);
          yMax = Math.max(yMax, positions[i * 3 + 1]);
        }
        const seuilSol = yMin + FRACTION_SOL * (yMax - yMin);
        const [sol, dessusMur, mur] = [PALETTE.solA, PALETTE.dessusMur, PALETTE.mur].map(enLineaire);
        const couleurs = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const ny = normales[i * 3 + 1];
          couleurs.set(ny > SEUIL_HAUT ? (positions[i * 3 + 1] <= seuilSol ? sol : dessusMur) : mur, i * 3);
        }
        const tampon = aligner4(Buffer.from(couleurs.buffer, couleurs.byteOffset, couleurs.byteLength));
        vues.push({ buffer: 0, byteOffset: longueurBin, byteLength: couleurs.byteLength, target: 34962 });
        accesseurs.push({ bufferView: vues.length - 1, componentType: 5126, count: n, type: "VEC3" });
        ajouts.push(tampon);
        longueurBin += tampon.length;
        let material = prim.material;
        if (material === undefined) {
          materiaux.push({ pbrMetallicRoughness: {} });
          material = materiaux.length - 1;
        }
        materiauxRecolores.add(material);
        recolore = true;
        return { ...prim, material, attributes: { ...prim.attributes, COLOR_0: accesseurs.length - 1 } };
      }),
    }));
    if (!recolore) return octets;
    const materials = materiaux.map((m, i) =>
      materiauxRecolores.has(i) ? { ...m, pbrMetallicRoughness: { ...m.pbrMetallicRoughness, baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } } : m,
    );
    const nouveauBin = Buffer.concat([aligner4(bin), ...ajouts]);
    const json = { ...doc, meshes, accessors: accesseurs, bufferViews: vues, buffers: [{ byteLength: nouveauBin.length }], materials };
    return ecrireGlb(json, nouveauBin) as T;
  } catch {
    return octets;
  }
}
