// Prototype : mesure un masque de segmentation (image : murs en noir, portes orange, fenêtres bleu)
// contre le JSON de référence Gemini — pièces par composantes connexes, IoU par pièce, portes.
// Usage : node scripts/prototypes/mesurer-masque.mjs <masque.png> <reference.gemini.json> [fermeture_px]
import sharp from "sharp";
import { readFileSync } from "node:fs";

const [cheminMasque, cheminRef, fermetureArg = "0"] = process.argv.slice(2);
const ref = JSON.parse(readFileSync(cheminRef, "utf8"));
if (String(ref.remarques ?? "").includes("Yytsi") || String(ref.remarques ?? "").includes("modèle")) throw new Error("Référence invalide : ce JSON vient d'un modèle, pas de Gemini.");
const { data, info } = await sharp(cheminMasque).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const px = (x, y) => [data[(y * W + x) * 3], data[(y * W + x) * 3 + 1], data[(y * W + x) * 3 + 2]];

// Classes par couleur : noir = mur, orange (r>150, b<80) = porte, bleu (b>150, r<80) = fenêtre
const classe = new Uint8Array(W * H);
let nbMur = 0, nbPorte = 0, nbFenetre = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const [r, g, b] = px(x, y);
  if (r < 100 && g < 100 && b < 100) { classe[y * W + x] = 1; nbMur++; }
  else if (r > 150 && b < 90 && g > 60) { classe[y * W + x] = 2; nbPorte++; }
  else if (b > 150 && r < 90) { classe[y * W + x] = 3; nbFenetre++; }
}
console.log(`masque ${W}×${H} — pixels mur ${nbMur}, porte ${nbPorte}, fenêtre ${nbFenetre}`);

function dilater(src, rayon) {
  if (rayon <= 0) return src;
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -rayon; k <= rayon && !v; k++) { const xx = x + k; if (xx >= 0 && xx < W && src[y * W + xx]) v = 1; } tmp[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -rayon; k <= rayon && !v; k++) { const yy = y + k; if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1; } out[y * W + x] = v; }
  return out;
}
function eroder(src, rayon) { const inv = src.map((v) => 1 - v); return dilater(inv, rayon).map((v) => 1 - v); }

function pieces(barriere) {
  const vu = new Uint8Array(W * H); const res = [];
  const pile = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (vu[s] || barriere[s]) continue;
    let n = 0, top = 0; pile[top++] = s; vu[s] = 1;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, aire = 0;
    while (top) {
      const p = pile[--top]; const x = p % W, y = (p - x) / W; aire++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
        if (!vu[q] && !barriere[q]) { vu[q] = 1; pile[top++] = q; }
      }
      n++;
    }
    if (aire < 0.004 * W * H) continue;
    if (x0 === 0 || y0 === 0 || x1 === W - 1 || y1 === H - 1) continue; // extérieur
    res.push({ nom: `Pièce ${res.length + 1}`, x: x0 / W, y: y0 / H, largeur: (x1 - x0 + 1) / W, hauteur: (y1 - y0 + 1) / H });
  }
  return res;
}
function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.largeur, b.x + b.largeur) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.hauteur, b.y + b.hauteur) - Math.max(a.y, b.y));
  const inter = ix * iy; const union = a.largeur * a.hauteur + b.largeur * b.hauteur - inter;
  return union ? inter / union : 0;
}
function rapport(titre, barriere) {
  const p = pieces(barriere);
  console.log(`\n=== ${titre} : ${p.length} pièce(s) du modèle`);
  console.log(`${"pièce Gemini".padEnd(18)}${"meilleure pièce modèle".padEnd(24)}IoU`);
  let ok = 0; const utilisees = new Map();
  for (const r of ref.pieces) {
    let meilleur = null, score = 0;
    for (const q of p) { const s = iou(r, q); if (s > score) { score = s; meilleur = q; } }
    if (score >= 0.7) ok++;
    if (meilleur) utilisees.set(meilleur.nom, (utilisees.get(meilleur.nom) ?? 0) + 1);
    console.log(`${r.nom.padEnd(18)}${(meilleur?.nom ?? "—").padEnd(24)}${score.toFixed(2)}`);
  }
  const fusions = [...utilisees.entries()].filter(([, n]) => n > 1).map(([nom, n]) => `${nom} couvre ${n} pièces Gemini`);
  console.log(`pièces retrouvées (IoU ≥ 0,7) : ${ok}/${ref.pieces.length}${fusions.length ? " — fusions : " + fusions.join(" ; ") : ""}`);
  return { p, ok };
}

const murs = new Uint8Array(W * H).map((_, i) => (classe[i] === 1 ? 1 : 0));
const toutes = new Uint8Array(W * H).map((_, i) => (classe[i] ? 1 : 0));
rapport("murs + portes + fenêtres comme barrière, dilatation 3 px (logique de la cellule 6)", dilater(toutes, 3));
const fermeture = Number(fermetureArg);
if (fermeture > 0) rapport(`idem, avec fermeture morphologique ${fermeture} px (comble les ouvertures de porte non détectées)`, eroder(dilater(murs, fermeture), fermeture - 3));
console.log(`\nportes de référence : ${ref.portes.length} ; pixels de classe porte dans le masque : ${nbPorte}`);
