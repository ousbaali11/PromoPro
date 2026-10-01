/*
 * Prototype : évalue le modèle ONNX « Solution PromoPro » sur un plan avec les
 * modules du site (inférence, segmentation, extrusion) et compare au JSON de
 * référence Gemini. Écrit le masque (PNG), le JSON et le .glb à côté du plan.
 * Usage : npx tsx scripts/prototypes/evaluer-promopro.ts <plan.png> <reference.gemini.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { segmenterPlan } from "@/lib/plan3d/inference";
import { extraireStructure, iouRectangles } from "@/lib/plan3d/segmentation";
import { dimensionsParDefaut, extruderEnGlb } from "@/lib/plan3d/extrusion";

async function main() {
const [plan, reference] = process.argv.slice(2);
if (!plan || !reference) throw new Error("Usage : evaluer-promopro.ts <plan.png> <reference.gemini.json>");
const ref = JSON.parse(readFileSync(reference, "utf8"));
if (/modèle|Yytsi/i.test(String(ref.remarques ?? ""))) throw new Error("Référence invalide : ce JSON vient d'un modèle.");

const debut = Date.now();
const masque = await segmenterPlan(readFileSync(plan));
const dureeInference = Date.now() - debut;
const { largeur: W, hauteur: H, classes } = masque;
const compte = [0, 0, 0, 0];
for (const c of classes) compte[c]++;
console.log(`inférence ${dureeInference} ms — ${W}×${H} — pixels fond/mur/porte/fenêtre : ${compte.join(" / ")}`);

const couleurs = [[255, 255, 255], [20, 20, 20], [230, 120, 0], [0, 120, 230]];
const rgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]] = couleurs[classes[i]];
const base = plan.replace(/\.(png|jpe?g)$/i, "");
await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${base}.promopro.masque.png`);

for (const [titre, options] of [
  ["sans fermeture", { fermeturePx: 0 }],
  ["fermeture par défaut (8 % du grand côté, selon chaque axe)", {}],
] as const) {
  const { pieces, portes } = extraireStructure(masque, options);
  console.log(`\n=== ${titre} : ${pieces.length} pièce(s), ${portes.length} porte(s)`);
  console.log(`${"pièce Gemini".padEnd(18)}${"meilleure pièce modèle".padEnd(24)}IoU`);
  let ok = 0;
  const usage = new Map<string, number>();
  for (const r of ref.pieces) {
    let meilleur: (typeof pieces)[number] | null = null;
    let score = 0;
    for (const q of pieces) {
      const s = iouRectangles(r, q);
      if (s > score) {
        score = s;
        meilleur = q;
      }
    }
    if (score >= 0.7) ok++;
    if (meilleur) usage.set(meilleur.nom, (usage.get(meilleur.nom) ?? 0) + 1);
    console.log(`${r.nom.padEnd(18)}${(meilleur?.nom ?? "—").padEnd(24)}${score.toFixed(2)}`);
  }
  const fusions = [...usage].filter(([, n]) => n > 1).map(([nom, n]) => `${nom} couvre ${n} pièces`);
  console.log(`pièces retrouvées (IoU ≥ 0,7) : ${ok}/${ref.pieces.length}${fusions.length ? " — fusions : " + fusions.join(" ; ") : ""}`);
  if (titre !== "sans fermeture") {
    writeFileSync(`${base}.promopro.json`, JSON.stringify({ pieces, portes, remarques: "modèle Solution PromoPro (ONNX)" }, null, 2));
    const { largeurM, hauteurM } = dimensionsParDefaut(W, H);
    const glb = extruderEnGlb(pieces, portes, largeurM, hauteurM);
    writeFileSync(`${base}.promopro.glb`, glb);
    console.log(`→ ${base}.promopro.glb (${glb.length} octets), ${base}.promopro.json, ${base}.promopro.masque.png`);
  }
}
console.log(`\nportes de référence : ${ref.portes.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
