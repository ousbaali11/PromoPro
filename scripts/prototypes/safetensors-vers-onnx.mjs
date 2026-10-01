// Produit un ONNX « PromoPro Avancée » à partir de best.safetensors (U-Net ResNet-34 SMP, PyTorch) en réutilisant
// le graphe de promopro-plan3d.onnx (même architecture) : chaque Conv du graphe, pris dans l'ordre d'exécution,
// reçoit le poids torch correspondant avec sa BatchNorm fusionnée (W' = W·γ/√(σ²+ε), b' = β − μ·γ/√(σ²+ε)).
// Les formes sont vérifiées une à une : toute différence arrête la conversion.
import { readFileSync } from "node:fs";
import { lireModele, ecrireModele } from "./onnx-proto.mjs";

const [safetensors, onnxSource, onnxSortie] = process.argv.slice(2);
const EPS = 1e-5;

// --- lecture safetensors
const fichier = readFileSync(safetensors);
const n = Number(fichier.readBigUInt64LE(0));
const entete = JSON.parse(fichier.subarray(8, 8 + n).toString("utf8"));
const base = 8 + n;
function tenseur(nom) {
  const t = entete[nom];
  if (!t) throw new Error("tenseur absent : " + nom);
  if (t.dtype !== "F32") throw new Error(`${nom} : dtype ${t.dtype}`);
  const [a, b] = t.data_offsets;
  const octets = fichier.subarray(base + a, base + b);
  return { shape: t.shape, data: new Float32Array(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)) };
}

// --- ordre d'exécution des convolutions (SMP Unet, encodeur resnet34)
const convs = [];
const ajouter = (conv, bn) => convs.push({ conv, bn });
ajouter("encoder.conv1", "encoder.bn1");
for (const [couche, blocs] of [["layer1", 3], ["layer2", 4], ["layer3", 6], ["layer4", 3]]) {
  for (let b = 0; b < blocs; b++) {
    const p = `encoder.${couche}.${b}`;
    ajouter(`${p}.conv1`, `${p}.bn1`);
    ajouter(`${p}.conv2`, `${p}.bn2`);
    if (b === 0 && couche !== "layer1") ajouter(`${p}.downsample.0`, `${p}.downsample.1`);
  }
}
for (let b = 0; b < 5; b++) {
  ajouter(`decoder.blocks.${b}.conv1.0`, `decoder.blocks.${b}.conv1.1`);
  ajouter(`decoder.blocks.${b}.conv2.0`, `decoder.blocks.${b}.conv2.1`);
}
convs.push({ conv: "segmentation_head.0", bn: null });

// --- graphe ONNX : Conv dans l'ordre, avec leurs initialisateurs poids / biais
const m = lireModele(onnxSource);
const init = new Map(m.initialisateurs.map((i) => [i.nom, i]));
const convsOnnx = m.noeuds.filter((x) => x.op === "Conv");
if (convsOnnx.length !== convs.length) throw new Error(`${convsOnnx.length} Conv dans l'ONNX, ${convs.length} attendues`);

const remplacements = new Map();
convs.forEach(({ conv, bn }, k) => {
  const noeud = convsOnnx[k];
  const [, nomW, nomB] = noeud.entrees;
  const W = tenseur(`${conv}.weight`);
  const iw = init.get(nomW), ib = init.get(nomB);
  if (!iw || !ib) throw new Error(`${conv} : initialisateurs ${nomW} / ${nomB} introuvables`);
  if (JSON.stringify(iw.dims) !== JSON.stringify(W.shape)) throw new Error(`${conv} : forme ${JSON.stringify(W.shape)} ≠ ONNX ${JSON.stringify(iw.dims)}`);
  const sorties = W.shape[0];
  const parSortie = W.data.length / sorties;
  const poids = new Float32Array(W.data);
  const biais = new Float32Array(sorties);
  if (bn) {
    const g = tenseur(`${bn}.weight`).data, be = tenseur(`${bn}.bias`).data, mu = tenseur(`${bn}.running_mean`).data, va = tenseur(`${bn}.running_var`).data;
    for (let o = 0; o < sorties; o++) {
      const s = g[o] / Math.sqrt(va[o] + EPS);
      for (let j = 0; j < parSortie; j++) poids[o * parSortie + j] *= s;
      biais[o] = be[o] - mu[o] * s;
    }
  } else {
    biais.set(tenseur(`${conv}.bias`).data);
  }
  remplacements.set(nomW, Buffer.from(poids.buffer));
  remplacements.set(nomB, Buffer.from(biais.buffer));
});
const faits = ecrireModele(onnxSource, onnxSortie, remplacements);
console.log(`${faits} initialisateurs remplacés sur ${m.initialisateurs.length} → ${onnxSortie}`);
