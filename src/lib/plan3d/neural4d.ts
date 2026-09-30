import { ErreurFournisseur, messageHttp, type Demarrage, type FournisseurPlan3d, type ImagePlan, type StatutGeneration } from "./provider";

/*
 * Adaptateur Neural4D — contrat documenté sur https://docs.neural4d.com :
 * - POST {base}/generateModelWithImage, Authorization: Bearer <clé>,
 *   multipart/form-data : image (image/*, 50 Mo max), mesh_quality, modelCount,
 *   disablePbr, onlyGenerateMesh
 *   → 200 { uuids: ["…"], uploadedImageUrl } ; 200 { limitType, message }
 *   quand l'image est refusée par la modération ; 400 / 401 / 402 / 429 / 500
 * - POST {base}/retrieveModel { uuid } → { codeStatus: 0 terminé (modelUrl),
 *   1 en cours, -1 jeton invalide, -2 uuid inconnu, -3 échec }
 * Réglages choisis : qualité standard, un seul modèle, sans textures PBR,
 * maillage seul (géométrie nue). La base est surchargeable (NEURAL4D_API_URL)
 * pour le simulateur des tests.
 */

export const NEURAL4D_BASE_PAR_DEFAUT = "https://alb.neural4d.com:3000/api";

function base() {
  return (process.env.NEURAL4D_API_URL ?? NEURAL4D_BASE_PAR_DEFAUT).replace(/\/+$/, "");
}

type ReponseDemarrage = { uuids?: string[]; limitType?: number; message?: string; error?: string; errors?: { msg?: string }[] };
type ReponseStatut = { codeStatus?: number; modelUrl?: string; message?: string };

/** Interprétation pure de la réponse de démarrage (testée sans réseau). */
export function lireReponseDemarrageNeural4d(statutHttp: number, corps: ReponseDemarrage): Demarrage {
  if (statutHttp >= 400) {
    const detail = corps.message ?? corps.error ?? corps.errors?.[0]?.msg;
    throw new ErreurFournisseur(detail ? `Neural4D : ${detail}` : messageHttp(statutHttp, "Neural4D"), statutHttp);
  }
  if (corps.uuids?.[0]) return { etat: "en_cours", reference: corps.uuids[0] };
  if (corps.limitType !== undefined) throw new ErreurFournisseur(`Neural4D a refusé l'image (${corps.message ?? "modération"}).`, 200);
  throw new ErreurFournisseur("Neural4D a répondu sans identifiant de tâche.", statutHttp);
}

/** Interprétation pure de la réponse retrieveModel. */
export function lireReponseStatutNeural4d(statutHttp: number, corps: ReponseStatut): StatutGeneration {
  if (statutHttp >= 400) throw new ErreurFournisseur(corps.message ?? messageHttp(statutHttp, "Neural4D"), statutHttp);
  switch (corps.codeStatus) {
    case 0:
      if (corps.modelUrl) return { etat: "pret", modelUrl: corps.modelUrl };
      return { etat: "echec", message: "Neural4D signale un succès sans fichier de modèle." };
    case 1:
      return { etat: "en_cours" };
    case -1:
      throw new ErreurFournisseur(messageHttp(401, "Neural4D"), 401);
    case -2:
      return { etat: "echec", message: "Neural4D ne connaît plus cette génération (identifiant inconnu)." };
    case -3:
      return { etat: "echec", message: corps.message ? `Neural4D : ${corps.message}` : "Neural4D n'a pas pu générer ce modèle." };
    default:
      return { etat: "en_cours" };
  }
}

async function corpsJson(reponse: Response): Promise<Record<string, unknown>> {
  try {
    return (await reponse.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const neural4d: FournisseurPlan3d = {
  code: "NEURAL4D",

  async demarrerGeneration(image: ImagePlan, cleApi: string): Promise<Demarrage> {
    const form = new FormData();
    form.append("image", new Blob([Buffer.from(image.octets)], { type: image.mime }), image.nomFichier);
    form.append("mesh_quality", "standard");
    form.append("modelCount", "1");
    form.append("disablePbr", "1");
    form.append("onlyGenerateMesh", "true");
    const reponse = await fetch(`${base()}/generateModelWithImage`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cleApi}`, Accept: "application/json" },
      body: form,
    });
    return lireReponseDemarrageNeural4d(reponse.status, (await corpsJson(reponse)) as ReponseDemarrage);
  },

  async verifierStatut(reference: string, cleApi: string): Promise<StatutGeneration> {
    const reponse = await fetch(`${base()}/retrieveModel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cleApi}`, "Content-Type": "application/json;charset=utf-8", Accept: "application/json" },
      body: JSON.stringify({ uuid: reference }),
    });
    return lireReponseStatutNeural4d(reponse.status, (await corpsJson(reponse)) as ReponseStatut);
  },
};
