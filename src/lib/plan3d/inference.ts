import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import type { Masque } from "./segmentation";
import type { VarianteModele } from "./provider";

/*
 * Inférence locale du modèle « Solution PromoPro » (U-Net ResNet-34 exporté
 * en ONNX par scripts/prototypes/colab/final/01-entrainement-complet.ipynb) :
 * image du plan → masque de classes (0 fond, 1 mur, 2 porte, 3 fenêtre), sur
 * CPU, sans Python. Prétraitement identique à l'entraînement : letterbox
 * (proportions conservées, complément blanc) vers le carré d'entrée du
 * modèle, normalisation ImageNet. Deux variantes du modèle, un fichier
 * chacune (hors dépôt git — 97 Mo), gardées en mémoire après le premier
 * chargement : « principal » (Solution PromoPro, PLAN3D_MODELE_CHEMIN /
 * PLAN3D_MODELE_URL, défaut storage/modeles/promopro-plan3d.onnx) et « b »
 * (PromoPro — variante B, PLAN3D_MODELE_B_CHEMIN / PLAN3D_MODELE_B_URL,
 * défaut storage/modeles/promopro-variante-b.onnx).
 */

export const VARIANTES: Record<VarianteModele, { libelle: string; fichier: string; envChemin: string; envUrl: string }> = {
  principal: { libelle: "Solution PromoPro", fichier: "promopro-plan3d.onnx", envChemin: "PLAN3D_MODELE_CHEMIN", envUrl: "PLAN3D_MODELE_URL" },
  b: { libelle: "PromoPro — variante B", fichier: "promopro-variante-b.onnx", envChemin: "PLAN3D_MODELE_B_CHEMIN", envUrl: "PLAN3D_MODELE_B_URL" },
};
export const CHEMIN_MODELE_PAR_DEFAUT = path.join("storage", "modeles", VARIANTES.principal.fichier);
const cheminParDefaut = (variante: VarianteModele) => path.join("storage", "modeles", VARIANTES[variante].fichier);
const TAILLE_ENTREE = 512;
const MOYENNE = [0.485, 0.456, 0.406];
const ECART = [0.229, 0.224, 0.225];

export function cheminModele(variante: VarianteModele = "principal") {
  return path.resolve(process.env[VARIANTES[variante].envChemin] ?? cheminParDefaut(variante));
}

export async function modeleDisponible(variante: VarianteModele = "principal"): Promise<boolean> {
  try {
    await access(cheminModele(variante));
    return true;
  } catch {
    return telechargerModeleSiConfigure(variante);
  }
}

const g2 = globalThis as unknown as { __promoproTelechargementModele?: Partial<Record<VarianteModele, Promise<boolean>>> };
/**
 * Sans fichier local, le modèle est téléchargé une fois depuis PLAN3D_MODELE_URL
 * (adresse directe, ex. une « release » GitHub) vers le chemin du modèle — sur
 * Railway, dans le volume persistant. Un échec laisse le fournisseur « non installé ».
 */
function telechargerModeleSiConfigure(variante: VarianteModele): Promise<boolean> {
  const { libelle, envUrl } = VARIANTES[variante];
  const url = process.env[envUrl]?.trim();
  if (!url) return Promise.resolve(false);
  const cache = (g2.__promoproTelechargementModele ??= {});
  cache[variante] ??= (async () => {
    try {
      const chemin = cheminModele(variante);
      await mkdir(path.dirname(chemin), { recursive: true });
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
      const octets = Buffer.from(await reponse.arrayBuffer());
      if (octets.length < 1_000_000) throw new Error("fichier trop petit pour être un modèle");
      await writeFile(`${chemin}.partiel`, octets);
      if (!(await modeleOnnxLisible(`${chemin}.partiel`))) {
        await unlink(`${chemin}.partiel`).catch(() => undefined);
        throw new Error(`le fichier servi par ${envUrl} n'est pas un modèle ONNX lisible (adresse erronée ? fichier .safetensors au lieu du .onnx ?)`);
      }
      await rename(`${chemin}.partiel`, chemin);
      console.log(`[plan3d] modèle ${libelle} téléchargé (${Math.round(octets.length / 1_000_000)} Mo) vers ${chemin}`);
      return true;
    } catch (e) {
      console.error(`[plan3d] téléchargement du modèle ${libelle} impossible :`, e);
      cache[variante] = undefined; // nouvelle tentative au prochain appel
      return false;
    }
  })();
  return cache[variante]!;
}

const g3 = globalThis as unknown as { __promoproEmpreintes?: Map<string, { cle: string; empreinte: string }> };
/**
 * Empreinte SHA-256 (huit premiers caractères) du fichier de modèle de la
 * variante, affichée sur sa carte pour vérifier quel fichier le serveur
 * charge réellement ; recalculée seulement si le fichier change (taille ou
 * date). Null si le fichier est absent.
 */
export async function empreinteModele(variante: VarianteModele = "principal"): Promise<string | null> {
  const chemin = cheminModele(variante);
  let infos;
  try {
    infos = await stat(chemin);
  } catch {
    return null;
  }
  const cle = `${infos.size}:${infos.mtimeMs}`;
  const cache = (g3.__promoproEmpreintes ??= new Map());
  const connue = cache.get(chemin);
  if (connue?.cle === cle) return connue.empreinte;
  const empreinte = await new Promise<string>((resoudre, rejeter) => {
    const h = createHash("sha256");
    createReadStream(chemin).on("data", (d) => h.update(d)).on("end", () => resoudre(h.digest("hex").slice(0, 8))).on("error", rejeter);
  });
  cache.set(chemin, { cle, empreinte });
  return empreinte;
}

export function messageModeleAbsent(variante: VarianteModele = "principal") {
  const { libelle, envChemin } = VARIANTES[variante];
  return `Le modèle « ${libelle} » n'est pas installé (${cheminParDefaut(variante)}, ou ${envChemin}). Voir DEPLOY.md.`;
}
export const MESSAGE_MODELE_ABSENT = messageModeleAbsent("principal");

const OPTIONS_SESSION: ort.InferenceSession.SessionOptions = { executionProviders: ["cpu"], graphOptimizationLevel: "all" };

/** Vrai si le fichier se charge comme un modèle ONNX (un .safetensors ou une page HTML téléchargée par erreur échouent ici). */
export async function modeleOnnxLisible(chemin: string): Promise<boolean> {
  try {
    await ort.InferenceSession.create(chemin, OPTIONS_SESSION);
    return true;
  } catch {
    return false;
  }
}

const g = globalThis as unknown as { __promoproSessionOnnx?: Partial<Record<VarianteModele, Promise<ort.InferenceSession>>> };
/**
 * Session ONNX de la variante, gardée en mémoire. Si le fichier présent ne se
 * charge pas (modèle illisible : mauvais fichier déposé ou téléchargé avant
 * que l'adresse ne soit corrigée), il est supprimé puis retéléchargé une fois
 * depuis l'adresse configurée ; sinon l'erreur dit quoi faire.
 */
function session(variante: VarianteModele): Promise<ort.InferenceSession> {
  const cache = (g.__promoproSessionOnnx ??= {});
  cache[variante] ??= (async () => {
    const chemin = cheminModele(variante);
    const { libelle, envUrl } = VARIANTES[variante];
    try {
      return await ort.InferenceSession.create(chemin, OPTIONS_SESSION);
    } catch (e) {
      console.error(`[plan3d] modèle ${libelle} illisible (${chemin}), supprimé :`, e instanceof Error ? e.message : e);
      await unlink(chemin).catch(() => undefined);
      const cacheTelechargement = g2.__promoproTelechargementModele;
      if (cacheTelechargement) cacheTelechargement[variante] = undefined;
      if (await telechargerModeleSiConfigure(variante)) return ort.InferenceSession.create(chemin, OPTIONS_SESSION);
      throw new Error(`Le fichier du modèle « ${libelle} » n'était pas un modèle ONNX lisible : il a été supprimé. Déposez le bon fichier .onnx ou définissez ${envUrl} (DEPLOY.md, section 12).`);
    }
  })().catch((e) => {
    cache[variante] = undefined;
    throw e;
  });
  return cache[variante]!;
}

/** Image du plan en niveaux de gris (un octet par pixel), aux dimensions demandées — pour `ajouterEncre`. */
export async function grisDuPlan(octets: Uint8Array, largeur: number, hauteur: number): Promise<Uint8Array> {
  const { data } = await sharp(Buffer.from(octets))
    .removeAlpha()
    .flatten({ background: "#ffffff" })
    .resize(largeur, hauteur, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** Segmente une image (PNG ou JPEG) avec la variante demandée et rend le masque à la taille de l'image d'origine. */
export async function segmenterPlan(octets: Uint8Array, variante: VarianteModele = "principal"): Promise<Masque> {
  const image = sharp(Buffer.from(octets)).removeAlpha().flatten({ background: "#ffffff" });
  const meta = await image.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error("Image du plan illisible.");

  // Letterbox : le grand côté sur TAILLE_ENTREE, complément blanc en bas et à droite
  const echelle = TAILLE_ENTREE / Math.max(W, H);
  const w = Math.max(1, Math.round(W * echelle));
  const h = Math.max(1, Math.round(H * echelle));
  const { data } = await image
    .resize(w, h, { fit: "fill", kernel: "lanczos3" })
    .extend({ top: 0, left: 0, bottom: TAILLE_ENTREE - h, right: TAILLE_ENTREE - w, background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const n = TAILLE_ENTREE * TAILLE_ENTREE;
  const entree = new Float32Array(3 * n);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++) entree[c * n + i] = (data[i * 3 + c] / 255 - MOYENNE[c]) / ECART[c];

  const s = await session(variante);
  const nomEntree = s.inputNames[0];
  const sortie = await s.run({ [nomEntree]: new ort.Tensor("float32", entree, [1, 3, TAILLE_ENTREE, TAILLE_ENTREE]) });
  const logits = sortie[s.outputNames[0]];
  const [, nbClasses, hs, ws] = logits.dims as number[];
  const valeurs = logits.data as Float32Array;

  // argmax par pixel sur la zone utile, puis remise à l'échelle de l'image d'origine (plus proche voisin)
  const petit = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let meilleure = 0;
      let max = -Infinity;
      for (let c = 0; c < nbClasses; c++) {
        const v = valeurs[c * hs * ws + y * ws + x];
        if (v > max) {
          max = v;
          meilleure = c;
        }
      }
      petit[y * w + x] = meilleure;
    }
  const classes = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.floor(y * echelle));
    for (let x = 0; x < W; x++) classes[y * W + x] = petit[sy * w + Math.min(w - 1, Math.floor(x * echelle))];
  }
  return { largeur: W, hauteur: H, classes };
}
