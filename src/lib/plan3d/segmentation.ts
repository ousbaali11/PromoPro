/*
 * Post-traitement pur d'un masque de segmentation (0 fond, 1 mur, 2 porte,
 * 3 fenêtre) : pièces par composantes connexes du sol — murs, portes et
 * fenêtres font barrière et les ouvertures de porte non reconnues sont
 * rebouchées le long de chaque axe, uniquement quand la coupure prolonge un
 * mur (jamais entre deux murs parallèles : un couloir, un WC ou une terrasse
 * étroits restent des pièces) —, portes par composantes de la classe porte de
 * taille plausible. `ajouterEncre` complète le masque du modèle avec les
 * traits sombres de l'image elle-même (murs fins, fenêtres en double trait),
 * après avoir écarté les petites composantes (texte, cotes). Sortie au format
 * partagé avec Gemini (coordonnées relatives). Testé dans
 * tests/unit/plan3d-interne.test.ts.
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

/**
 * Rebouche, le long d'un axe, les coupures entre deux tronçons de mur :
 * toujours quand elles font au plus `ecartMin` pixels (cassures du masque,
 * angles mal joints), et jusqu'à `ecartMax` pixels quand l'un des tronçons
 * mesure au moins `tronconMin` pixels dans cette direction — une porte
 * interrompt un mur qui se prolonge de part et d'autre (ou qui bute sur un
 * mur perpendiculaire). Un couloir, un WC ou une terrasse étroits, bordés de
 * murs perpendiculaires à l'axe (tronçons courts, de l'épaisseur du mur), ne
 * sont pas remplis.
 */
function reboucherSelonAxe(src: Uint8Array, W: number, H: number, ecartMin: number, ecartMax: number, tronconMin: number, horizontal: boolean): Uint8Array {
  const out = new Uint8Array(W * H);
  const longueur = horizontal ? W : H;
  const lignes = horizontal ? H : W;
  const indice = (l: number, i: number) => (horizontal ? l * W + i : i * W + l);
  for (let l = 0; l < lignes; l++) {
    // Tronçons [debut, fin] de mur sur la ligne
    const troncons: [number, number][] = [];
    let i = 0;
    while (i < longueur) {
      if (!src[indice(l, i)]) {
        i++;
        continue;
      }
      const debut = i;
      while (i < longueur && src[indice(l, i)]) i++;
      troncons.push([debut, i - 1]);
    }
    for (let t = 0; t + 1 < troncons.length; t++) {
      const [a0, a1] = troncons[t];
      const [b0, b1] = troncons[t + 1];
      const ecart = b0 - a1 - 1;
      if (ecart > ecartMax) continue;
      if (ecart > ecartMin && a1 - a0 + 1 < tronconMin && b1 - b0 + 1 < tronconMin) continue;
      for (let k = a1 + 1; k < b0; k++) out[indice(l, k)] = 1;
    }
  }
  return out;
}

/** Étiquetage des composantes connexes (8-connexité) d'un masque binaire : étiquette par pixel et boîte de chaque composante. */
function etiqueter(binaire: Uint8Array, W: number, H: number) {
  const etiquette = new Int32Array(W * H).fill(-1);
  const boites: { x0: number; y0: number; x1: number; y1: number; aire: number }[] = [];
  const pile = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!binaire[s] || etiquette[s] >= 0) continue;
    const id = boites.length;
    const b = { x0: W, y0: H, x1: 0, y1: 0, aire: 0 };
    boites.push(b);
    etiquette[s] = id;
    let top = 0;
    pile[top++] = s;
    while (top) {
      const p = pile[--top];
      const x = p % W;
      const y = (p - x) / W;
      b.aire++;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (binaire[q] && etiquette[q] < 0) {
            etiquette[q] = id;
            pile[top++] = q;
          }
        }
    }
  }
  return { etiquette, boites };
}

export type OptionsEncre = {
  /** Niveau de gris (0 à 255) en dessous duquel un pixel est de l'encre. */
  seuil?: number;
  /** Fraction du grand côté : une composante d'encre plus petite dans ses deux dimensions est du texte ou une cote, ignorée. */
  coteMin?: number;
  /** Part minimale des pixels d'une composante situés sur des traits droits (horizontaux ou verticaux) pour qu'elle soit un mur ou une fenêtre, et non un arc de porte ou un équipement. */
  droitureMin?: number;
  /** Au-delà de cette fraction de pixels d'encre gardés, l'image n'est pas un plan au trait (photo, scan sombre) : rien n'est ajouté. */
  fractionMax?: number;
};

/** Longueur minimale d'un trait droit (en pixels) pour compter dans la droiture d'une composante. */
const TRAIT_DROIT_PX = 8;
/** Rayon (en pixels) autour du texte où les classes porte et fenêtre du modèle sont effacées. */
const HALO_TEXTE_PX = 5;

/**
 * Complète le masque du modèle avec les traits sombres de l'image du plan
 * (`gris` : un octet par pixel, mêmes dimensions que le masque). Le modèle
 * entraîné sur ResPlan ne reconnaît ni les murs fins ni les fenêtres en
 * double trait des plans réels ; sur un plan au trait, ces pixels sombres
 * sont des barrières fiables. Ne sont gardés que les traits situés hors des
 * murs déjà reconnus (légèrement dilatés, ce qui détache des murs les arcs de
 * porte et les équipements qui les touchent), assez grands (le texte et les
 * cotes sont écartés) et droits (un arc de porte, un lavabo ou une cuvette
 * sont écartés ; une baignoire rectangulaire ne l'est pas). Rend le nombre
 * de pixels ajoutés ; ne touche pas au masque si l'image n'a pas un fond
 * clair ou si l'encre gardée couvre trop de surface (photo, scan sombre).
 */
export function ajouterEncre(masque: Masque, gris: Uint8Array, options: OptionsEncre = {}): number {
  const { largeur: W, hauteur: H, classes } = masque;
  if (gris.length !== W * H) throw new Error("ajouterEncre : l'image en gris n'a pas les dimensions du masque.");
  const seuil = options.seuil ?? 200;
  const coteMin = (options.coteMin ?? 0.03) * Math.max(W, H);
  const droitureMin = options.droitureMin ?? 0.6;
  const fractionMax = options.fractionMax ?? 0.25;
  // Fond clair : la médiane des pixels doit être presque blanche
  const histogramme = new Uint32Array(256);
  for (let i = 0; i < W * H; i++) histogramme[gris[i]]++;
  let cumul = 0, mediane = 0;
  for (let v = 0; v < 256; v++) {
    cumul += histogramme[v];
    if (cumul * 2 >= W * H) {
      mediane = v;
      break;
    }
  }
  if (mediane < 225) return 0;
  // Encre hors des barrières déjà reconnues (dilatées)
  const barriere = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (classes[i] !== CLASSE.FOND) barriere[i] = 1;
  const barriereDilatee = dilater(barriere, W, H, 4);
  const encre = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (gris[i] < seuil && !barriereDilatee[i]) encre[i] = 1;
  // Les lettres que le modèle a classées porte ou fenêtre sont sous une barrière : elles sont réintégrées à l'encre
  // pour être reconnues comme texte (elles restent exclues des murs ajoutés, n'étant ni grandes ni droites)
  for (let i = 0; i < W * H; i++) if (gris[i] < seuil && (classes[i] === CLASSE.PORTE || classes[i] === CLASSE.FENETRE)) encre[i] = 1;
  const { etiquette, boites } = etiqueter(encre, W, H);
  // Droiture : pixels appartenant à un trait horizontal ou vertical d'au moins TRAIT_DROIT_PX pixels
  const droit = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!encre[y * W + x]) {
        x++;
        continue;
      }
      const debut = x;
      while (x < W && encre[y * W + x]) x++;
      if (x - debut >= TRAIT_DROIT_PX) for (let k = debut; k < x; k++) droit[y * W + k] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!encre[y * W + x]) {
        y++;
        continue;
      }
      const debut = y;
      while (y < H && encre[y * W + x]) y++;
      if (y - debut >= TRAIT_DROIT_PX) for (let k = debut; k < y; k++) droit[k * W + x] = 1;
    }
  }
  const droits = new Uint32Array(boites.length);
  for (let i = 0; i < W * H; i++) if (encre[i] && droit[i]) droits[etiquette[i]]++;
  const gardee = boites.map((b, id) => Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) >= coteMin && droits[id] >= droitureMin * b.aire);
  // Texte et cotes (petites composantes d'encre) : le modèle les prend souvent pour des portes ou des fenêtres ;
  // ces classes sont effacées autour d'eux (le halo du modèle déborde de quelques pixels des lettres)
  const texte = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (encre[i] && Math.max(boites[etiquette[i]].x1 - boites[etiquette[i]].x0 + 1, boites[etiquette[i]].y1 - boites[etiquette[i]].y0 + 1) < coteMin) texte[i] = 1;
  const texteDilate = dilater(texte, W, H, HALO_TEXTE_PX);
  for (let i = 0; i < W * H; i++) if (texteDilate[i] && (classes[i] === CLASSE.PORTE || classes[i] === CLASSE.FENETRE)) classes[i] = CLASSE.FOND;
  let total = 0;
  for (let i = 0; i < W * H; i++) if (encre[i] && gardee[etiquette[i]]) total++;
  if (total > fractionMax * W * H) return 0;
  let ajoutes = 0;
  for (let i = 0; i < W * H; i++) {
    if (!encre[i] || !gardee[etiquette[i]]) continue;
    classes[i] = CLASSE.MUR;
    ajoutes++;
  }
  return ajoutes;
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

/** Marge, en pixels, au-delà de chaque extrémité d'une ouverture où un mur doit être trouvé. */
const MARGE_OUVERTURE_PX = 6;

/**
 * Ne garde des classes porte et fenêtre que les composantes posées dans un
 * mur : du mur doit se trouver aux deux extrémités de leur grand axe. Un
 * nom de pièce ou une cote pris pour une porte (le modèle confond le texte
 * avec les ouvertures) flotte au milieu d'une pièce ou ne touche un mur que
 * d'un côté : il redevient du fond, et ne coupe plus la pièce en deux ni ne
 * crée de fausse porte. Rend une copie des classes.
 */
export function ouverturesDansLesMurs(masque: Masque): Uint8Array {
  const { largeur: W, hauteur: H } = masque;
  const classes = new Uint8Array(masque.classes);
  const ouvertures = new Uint8Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) if (classes[i] === CLASSE.PORTE || classes[i] === CLASSE.FENETRE) ouvertures[i] = n++ ? 1 : 1;
  if (!n) return classes;
  const { etiquette, boites } = etiqueter(ouvertures, W, H);
  const murA = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) if (classes[y * W + x] === CLASSE.MUR) return true;
    return false;
  };
  const gardee = boites.map((b) => {
    const horizontale = b.x1 - b.x0 >= b.y1 - b.y0;
    const m = MARGE_OUVERTURE_PX;
    return horizontale
      ? murA(b.x0 - m, b.x0 - 1, b.y0 - 1, b.y1 + 1) && murA(b.x1 + 1, b.x1 + m, b.y0 - 1, b.y1 + 1)
      : murA(b.x0 - 1, b.x1 + 1, b.y0 - m, b.y0 - 1) && murA(b.x0 - 1, b.x1 + 1, b.y1 + 1, b.y1 + m);
  });
  for (let i = 0; i < W * H; i++) if (ouvertures[i] && !gardee[etiquette[i]]) classes[i] = CLASSE.FOND;
  return classes;
}

/**
 * Pièces et portes d'un masque. `fermeturePx` : largeur maximale d'une coupure
 * de mur rebouchée (par défaut 8 % du grand côté, soit une ouverture de porte
 * et sa marge ; un tronçon de mur d'au moins la moitié de cette largeur doit
 * la border, sauf pour les coupures d'au plus un quart, toujours rebouchées) ; `aireMin` : fraction de l'image en dessous de laquelle une
 * composante est ignorée (miettes).
 */
export function extraireStructure(masque: Masque, options: { fermeturePx?: number; aireMin?: number } = {}): Structure {
  const { largeur: W, hauteur: H } = masque;
  const classes = ouverturesDansLesMurs(masque);
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
    const tronconMin = Math.max(1, Math.round(fermeture / 2));
    const ecartMin = Math.max(1, Math.round(fermeture / 4));
    const fermesH = reboucherSelonAxe(murs, W, H, ecartMin, fermeture, tronconMin, true);
    const fermesV = reboucherSelonAxe(murs, W, H, ecartMin, fermeture, tronconMin, false);
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
