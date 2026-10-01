/*
 * Post-traitement pur d'un masque de segmentation (0 fond, 1 mur, 2 porte,
 * 3 fenêtre) : pièces par composantes connexes du sol — murs, portes et
 * fenêtres font barrière et les ouvertures de porte non reconnues sont
 * refermées par une fermeture morphologique le long de chaque axe (jamais en
 * 2D, pour ne pas remplir un couloir étroit) —, portes par composantes de la
 * classe porte de taille plausible. Sortie au format partagé avec Gemini
 * (coordonnées relatives). Testé dans tests/unit/plan3d-segmentation.test.ts.
 */

export type Masque = { largeur: number; hauteur: number; classes: Uint8Array };
export type Piece = { nom: string; x: number; y: number; largeur: number; hauteur: number };
export type Porte = { x: number; y: number; mur: "vertical" | "horizontal" };
export type Structure = { pieces: Piece[]; portes: Porte[] };

export const CLASSE = { FOND: 0, MUR: 1, PORTE: 2, FENETRE: 3 } as const;

function dilater(src: Uint8Array, W: number, H: number, rayon: number): Uint8Array {
  if (rayon <= 0) return src;
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -rayon; k <= rayon && !v; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < W && src[y * W + xx]) v = 1;
      }
      tmp[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -rayon; k <= rayon && !v; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1;
      }
      out[y * W + x] = v;
    }
  return out;
}

/** Dilatation puis érosion le long d'un seul axe : rebouche les coupures d'un mur sans remplir les pièces étroites. */
function fermerSelonAxe(src: Uint8Array, W: number, H: number, rayon: number, horizontal: boolean): Uint8Array {
  const out = new Uint8Array(W * H);
  const longueur = horizontal ? W : H;
  const lignes = horizontal ? H : W;
  const ligne = new Uint8Array(longueur);
  const dil = new Uint8Array(longueur);
  for (let l = 0; l < lignes; l++) {
    for (let i = 0; i < longueur; i++) ligne[i] = horizontal ? src[l * W + i] : src[i * W + l];
    for (let i = 0; i < longueur; i++) {
      let v = 0;
      for (let k = -rayon; k <= rayon && !v; k++) if (i + k >= 0 && i + k < longueur && ligne[i + k]) v = 1;
      dil[i] = v;
    }
    for (let i = 0; i < longueur; i++) {
      let v = 1;
      for (let k = -rayon; k <= rayon && v; k++) if (i + k >= 0 && i + k < longueur && !dil[i + k]) v = 0;
      if (v) {
        if (horizontal) out[l * W + i] = 1;
        else out[i * W + l] = 1;
      }
    }
  }
  return out;
}

type Composante = { x0: number; y0: number; x1: number; y1: number; aire: number; cx: number; cy: number };

function composantes(binaire: Uint8Array, W: number, H: number, connexite4: boolean): Composante[] {
  const vu = new Uint8Array(W * H);
  const pile = new Int32Array(W * H);
  const res: Composante[] = [];
  for (let s = 0; s < W * H; s++) {
    if (vu[s] || !binaire[s]) continue;
    let top = 0;
    pile[top++] = s;
    vu[s] = 1;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, aire = 0, sx = 0, sy = 0;
    while (top) {
      const p = pile[--top];
      const x = p % W;
      const y = (p - x) / W;
      aire++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const voisins = connexite4 ? [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]];
      for (const [vx, vy] of voisins) {
        if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
        const q = vy * W + vx;
        if (!vu[q] && binaire[q]) {
          vu[q] = 1;
          pile[top++] = q;
        }
      }
    }
    res.push({ x0, y0, x1, y1, aire, cx: sx / aire, cy: sy / aire });
  }
  return res;
}

/**
 * Pièces et portes d'un masque. `fermeturePx` : taille de la fermeture qui
 * rebouche les ouvertures de porte (par défaut 8 % du grand côté, soit une
 * ouverture de porte et sa marge) ; `aireMin` : fraction de l'image en dessous
 * de laquelle une composante est ignorée (miettes).
 */
export function extraireStructure(masque: Masque, options: { fermeturePx?: number; aireMin?: number } = {}): Structure {
  const { largeur: W, hauteur: H, classes } = masque;
  const fermeture = options.fermeturePx ?? Math.round(0.08 * Math.max(W, H));
  const aireMin = (options.aireMin ?? 0.004) * W * H;

  const murs = new Uint8Array(W * H);
  const barriere = new Uint8Array(W * H);
  const portesBin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (classes[i] === CLASSE.MUR) murs[i] = 1;
    if (classes[i] !== CLASSE.FOND) barriere[i] = 1;
    if (classes[i] === CLASSE.PORTE) portesBin[i] = 1;
  }
  let fermee: Uint8Array = barriere;
  if (fermeture > 0) {
    const r = Math.max(1, Math.round(fermeture / 2));
    const fermesH = fermerSelonAxe(murs, W, H, r, true);
    const fermesV = fermerSelonAxe(murs, W, H, r, false);
    fermee = barriere.map((v, i) => (v || fermesH[i] || fermesV[i] ? 1 : 0));
  }
  fermee = dilater(fermee, W, H, 3);
  const sol = fermee.map((v) => 1 - v);

  const pieces: Piece[] = [];
  for (const c of composantes(sol, W, H, true)) {
    if (c.aire < aireMin) continue;
    if (c.x0 === 0 || c.y0 === 0 || c.x1 === W - 1 || c.y1 === H - 1) continue; // l'extérieur touche le bord
    pieces.push({ nom: `Pièce ${pieces.length + 1}`, x: c.x0 / W, y: c.y0 / H, largeur: (c.x1 - c.x0 + 1) / W, hauteur: (c.y1 - c.y0 + 1) / H });
  }
  // Ordre de lecture : haut en bas, gauche à droite
  pieces.sort((a, b) => a.y - b.y || a.x - b.x).forEach((p, i) => (p.nom = `Pièce ${i + 1}`));

  const portes: Porte[] = [];
  for (const c of composantes(portesBin, W, H, false)) {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    if (c.aire < 0.0002 * W * H || Math.max(w, h) > 0.15 * Math.max(W, H)) continue;
    portes.push({ x: c.cx / W, y: c.cy / H, mur: h > w ? "vertical" : "horizontal" });
  }
  return { pieces, portes };
}

/** IoU de deux rectangles relatifs (pour les tests et l'évaluation). */
export function iouRectangles(a: Piece, b: Piece) {
  const ix = Math.max(0, Math.min(a.x + a.largeur, b.x + b.largeur) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.hauteur, b.y + b.hauteur) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.largeur * a.hauteur + b.largeur * b.hauteur - inter;
  return union ? inter / union : 0;
}
