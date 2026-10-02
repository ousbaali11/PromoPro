import sharp from "sharp";
import { saveUpload } from "@/lib/storage";
import { ErreurFournisseur, messageHttp, type Demarrage, type FournisseurPlan3d, type ImagePlan, type StatutGeneration } from "./provider";
import type { Piece, Porte, Structure } from "./segmentation";
import { dimensionsParDefaut, extruderEnGlb } from "./extrusion";

/*
 * Adaptateur Gemini (Google) — le modèle multimodal lit l'image du plan et
 * rend la structure en JSON (pièces en coordonnées relatives avec leur nom lu
 * sur le plan, portes, dimensions réelles si une échelle est visible) ; le
 * .glb est ensuite produit par l'extrusion commune (extrusion.ts, palette
 * commune) et enregistré comme fichier plans-3d. Synchrone : une seule
 * requête, quelques secondes.
 *
 * API : POST {base}/models/{modèle}:generateContent, en-tête x-goog-api-key,
 * corps { contents: [{ parts: [{ text }, { inline_data: { mime_type, data } }] }],
 * generationConfig: { temperature: 0, response_mime_type: "application/json" } }
 * → 200 { candidates: [{ content: { parts: [{ text: "<JSON>" }] } }] }
 * → 400 « API key not valid » / 403 (clé), 429 (quota), 503 (forte demande,
 * rejouée). La base (GEMINI_API_URL) et le modèle (GEMINI_MODEL) sont
 * surchargeables ; la suite e2e pointe la base vers le simulateur. Quand
 * Google retire un modèle, sa réponse d'erreur nomme le remplaçant
 * (« Please update your code to use models/… ») : l'appel est rejoué une
 * fois avec ce modèle, le temps de mettre GEMINI_MODEL à jour.
 * Prototype d'origine : scripts/prototypes/test-lecture-plan.ts.
 */

export const GEMINI_BASE_PAR_DEFAUT = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_MODELE_PAR_DEFAUT = "gemini-3.8-flash";
/** Tentatives sur 503 (forte demande), et délai entre deux tentatives. */
const TENTATIVES_503 = 3;
const DELAI_503_MS = Number(process.env.GEMINI_DELAI_503_MS) || 10_000;

export const PROMPT_GEMINI = `Tu analyses l'image d'un plan d'architecte 2D (vue de dessus d'un logement).
Renvoie UNIQUEMENT un objet JSON strict, sans commentaire ni markdown, de la forme :
{
  "pieces": [ { "nom": "Salon", "x": 0.12, "y": 0.08, "largeur": 0.3, "hauteur": 0.4 } ],
  "portes": [ { "x": 0.42, "y": 0.25, "mur": "vertical", "relie": ["Salon", "Cuisine"] } ],
  "dimensions_m": { "largeur": 16.4, "hauteur": 12.4 },
  "remarques": "texte court"
}
Règles :
- x, y = coin haut-gauche de la pièce, largeur et hauteur : fractions de la largeur et de la hauteur totales de l'image (entre 0 et 1), mesurées sur les murs qui délimitent la pièce.
- Une pièce = une zone fermée par des murs. Le nom est celui lisible sur le plan (sinon "Pièce N").
- Une porte = une ouverture dans un mur (arc de porte, interruption du trait) ; x, y = son centre en fractions ; "mur" = "vertical" ou "horizontal" ; "relie" = les deux pièces (ou "extérieur").
- "dimensions_m" = largeur et hauteur réelles de l'image entière en mètres, seulement si une échelle ou des cotes le permettent ; sinon omets ce champ.
- Ne fais aucune supposition non visible ; si l'image n'est pas un plan, renvoie { "pieces": [], "portes": [], "remarques": "..." }.`;

function base() {
  return (process.env.GEMINI_API_URL ?? GEMINI_BASE_PAR_DEFAUT).replace(/\/+$/, "");
}

export function modeleGemini() {
  return process.env.GEMINI_MODEL?.trim() || GEMINI_MODELE_PAR_DEFAUT;
}

/** Modèle de remplacement nommé par Google dans un message de retrait (« use models/gemini-x »), ou null. */
export function modeleSuggere(message: string | undefined): string | null {
  const m = message?.match(/use models\/([A-Za-z0-9._-]+)/);
  return m ? m[1] : null;
}

type Enveloppe = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  error?: { code?: number; message?: string; status?: string };
  promptFeedback?: { blockReason?: string };
};

export type LectureGemini = Structure & { dimensionsM?: { largeur: number; hauteur: number }; remarques?: string };

const nombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Interprétation pure de la réponse HTTP de Gemini (testée sans réseau). */
export function lireReponseGemini(statutHttp: number, corps: Enveloppe): LectureGemini {
  if (statutHttp >= 400) {
    const message = corps.error?.message ?? "";
    if (statutHttp === 400 && /api key/i.test(message)) throw new ErreurFournisseur(messageHttp(401, "Gemini"), 401);
    if (statutHttp === 403) throw new ErreurFournisseur(messageHttp(401, "Gemini"), 403);
    if (statutHttp === 429) throw new ErreurFournisseur(messageHttp(429, "Gemini"), 429);
    throw new ErreurFournisseur(message ? `Gemini : ${message}` : messageHttp(statutHttp, "Gemini"), statutHttp);
  }
  if (corps.promptFeedback?.blockReason) throw new ErreurFournisseur(`Gemini a refusé l'image (${corps.promptFeedback.blockReason}).`);
  const texte = corps.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!texte.trim()) throw new ErreurFournisseur("Gemini a répondu sans contenu.");
  let brut: { pieces?: unknown; portes?: unknown; dimensions_m?: unknown; remarques?: unknown };
  try {
    brut = JSON.parse(texte.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new ErreurFournisseur("Gemini a répondu autre chose que le JSON attendu.");
  }
  const pieces: Piece[] = [];
  for (const [i, p] of (Array.isArray(brut.pieces) ? brut.pieces : []).entries()) {
    if (!p || typeof p !== "object") continue;
    const { nom, x, y, largeur, hauteur } = p as Record<string, unknown>;
    if (!nombre(x) || !nombre(y) || !nombre(largeur) || !nombre(hauteur)) continue;
    if (largeur <= 0 || hauteur <= 0 || x < 0 || y < 0 || x + largeur > 1.001 || y + hauteur > 1.001) continue;
    pieces.push({ nom: typeof nom === "string" && nom.trim() ? nom.trim() : `Pièce ${i + 1}`, x, y, largeur: Math.min(largeur, 1 - x), hauteur: Math.min(hauteur, 1 - y) });
  }
  const portes: Porte[] = [];
  for (const d of Array.isArray(brut.portes) ? brut.portes : []) {
    if (!d || typeof d !== "object") continue;
    const { x, y, mur } = d as Record<string, unknown>;
    if (!nombre(x) || !nombre(y) || x < 0 || y < 0 || x > 1 || y > 1) continue;
    portes.push({ x, y, mur: mur === "vertical" ? "vertical" : "horizontal" });
  }
  let dimensionsM: LectureGemini["dimensionsM"];
  if (brut.dimensions_m && typeof brut.dimensions_m === "object") {
    const { largeur, hauteur } = brut.dimensions_m as Record<string, unknown>;
    // Plausible pour un logement : de 3 à 100 m de côté
    if (nombre(largeur) && nombre(hauteur) && largeur >= 3 && largeur <= 100 && hauteur >= 3 && hauteur <= 100) dimensionsM = { largeur, hauteur };
  }
  return { pieces, portes, dimensionsM, remarques: typeof brut.remarques === "string" ? brut.remarques : undefined };
}

async function corpsJson(reponse: Response): Promise<Enveloppe> {
  try {
    return (await reponse.json()) as Enveloppe;
  } catch {
    return {};
  }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const gemini: FournisseurPlan3d = {
  code: "GEMINI",

  async demarrerGeneration(image: ImagePlan, cleApi: string): Promise<Demarrage> {
    const corps = {
      contents: [{ role: "user", parts: [{ text: PROMPT_GEMINI }, { inline_data: { mime_type: image.mime, data: Buffer.from(image.octets).toString("base64") } }] }],
      generationConfig: { temperature: 0, response_mime_type: "application/json" },
    };
    const appeler = async (modele: string) => {
      let reponse: Response | undefined;
      for (let tentative = 1; tentative <= TENTATIVES_503; tentative++) {
        reponse = await fetch(`${base()}/models/${encodeURIComponent(modele)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": cleApi, Accept: "application/json" },
          body: JSON.stringify(corps),
        });
        if (reponse.status !== 503 || tentative === TENTATIVES_503) break;
        await attendre(DELAI_503_MS);
      }
      return { statut: reponse!.status, corps: await corpsJson(reponse!) };
    };
    let { statut, corps: enveloppe } = await appeler(modeleGemini());
    // Modèle retiré par Google : rejoué une fois avec le remplaçant qu'il indique
    const remplacant = statut >= 400 ? modeleSuggere(enveloppe.error?.message) : null;
    if (remplacant && remplacant !== modeleGemini()) {
      console.warn(`[plan3d] Gemini : modèle ${modeleGemini()} retiré, nouvel essai avec ${remplacant} (mettez GEMINI_MODEL à jour).`);
      ({ statut, corps: enveloppe } = await appeler(remplacant));
    }
    const lecture = lireReponseGemini(statut, enveloppe);
    if (lecture.pieces.length === 0) {
      throw new ErreurFournisseur(`Gemini n'a reconnu aucune pièce sur cette image${lecture.remarques ? ` (${lecture.remarques})` : ""}.`);
    }
    const meta = await sharp(Buffer.from(image.octets)).metadata();
    const { largeurM, hauteurM } = lecture.dimensionsM
      ? { largeurM: lecture.dimensionsM.largeur, hauteurM: lecture.dimensionsM.hauteur }
      : dimensionsParDefaut(meta.width ?? 1000, meta.height ?? 1000);
    const glb = extruderEnGlb(lecture.pieces, lecture.portes, largeurM, hauteurM);
    const modelUrl = await saveUpload("plans-3d", "modele.glb", glb);
    return { etat: "pret", modelUrl };
  },

  async verifierStatut(): Promise<StatutGeneration> {
    // La génération est synchrone : il n'y a jamais de tâche à suivre
    return { etat: "echec", message: "Gemini : aucune génération en attente à vérifier." };
  },
};
