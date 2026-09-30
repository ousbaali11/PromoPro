import { ErreurFournisseur, messageHttp, type Demarrage, type FournisseurPlan3d, type ImagePlan, type StatutGeneration } from "./provider";

/*
 * Adaptateur MeltFlex — contrat documenté sur https://www.meltflexai.com/api :
 * - POST {base}/floorplan-to-3d, Authorization: Bearer <clé>, JSON
 *   { image: "data:image/png;base64,…", output: "model", textured: false }
 *   → 200 { success: true, modelUrl } (déjà prêt)
 *   → 202 { status: "IN_PROGRESS", taskId, pollUrl } (2 à 3 minutes)
 *   → 400 / 401 / 402 / 429 / 502 (conversion échouée, crédits remboursés)
 * - GET {base}/floorplan-to-3d?taskId=… → { status: PENDING | IN_PROGRESS |
 *   SUCCEEDED | FAILED, modelUrl, progress, error }
 * `textured: false` : géométrie nue (murs et pièces), ce que l'application attend.
 * La base est surchargeable (MELTFLEX_API_URL) pour le simulateur des tests.
 */

export const MELTFLEX_BASE_PAR_DEFAUT = "https://www.meltflexai.com/api/v1";

function base() {
  return (process.env.MELTFLEX_API_URL ?? MELTFLEX_BASE_PAR_DEFAUT).replace(/\/+$/, "");
}

type ReponseDemarrage = { success?: boolean; modelUrl?: string; status?: string; taskId?: string; error?: string; message?: string };
type ReponseStatut = { status?: string; modelUrl?: string; progress?: number; error?: string };

/** Interprétation pure de la réponse de démarrage (testée sans réseau). */
export function lireReponseDemarrageMeltflex(statutHttp: number, corps: ReponseDemarrage): Demarrage {
  if (statutHttp === 200 && corps.modelUrl) return { etat: "pret", modelUrl: corps.modelUrl };
  if (statutHttp === 202 && corps.taskId) return { etat: "en_cours", reference: corps.taskId };
  if (statutHttp === 502) throw new ErreurFournisseur(`MeltFlex n'a pas pu convertir ce plan (${corps.error ?? "conversion échouée"}).`, 502);
  if (statutHttp >= 400) throw new ErreurFournisseur(corps.error ?? corps.message ?? messageHttp(statutHttp, "MeltFlex"), statutHttp);
  throw new ErreurFournisseur("MeltFlex a répondu sans identifiant de tâche ni modèle.", statutHttp);
}

/** Interprétation pure de la réponse de suivi. */
export function lireReponseStatutMeltflex(statutHttp: number, corps: ReponseStatut): StatutGeneration {
  if (statutHttp >= 400) throw new ErreurFournisseur(corps.error ?? messageHttp(statutHttp, "MeltFlex"), statutHttp);
  switch (corps.status) {
    case "SUCCEEDED":
      if (corps.modelUrl) return { etat: "pret", modelUrl: corps.modelUrl };
      return { etat: "echec", message: "MeltFlex signale un succès sans fichier de modèle." };
    case "FAILED":
      return { etat: "echec", message: corps.error ? `MeltFlex : ${corps.error}` : "MeltFlex n'a pas pu convertir ce plan." };
    default:
      return { etat: "en_cours", progression: typeof corps.progress === "number" ? corps.progress : undefined };
  }
}

async function corpsJson(reponse: Response): Promise<Record<string, unknown>> {
  try {
    return (await reponse.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const meltflex: FournisseurPlan3d = {
  code: "MELTFLEX",

  async demarrerGeneration(image: ImagePlan, cleApi: string): Promise<Demarrage> {
    const dataUrl = `data:${image.mime};base64,${Buffer.from(image.octets).toString("base64")}`;
    const reponse = await fetch(`${base()}/floorplan-to-3d`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cleApi}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ image: dataUrl, output: "model", textured: false }),
    });
    return lireReponseDemarrageMeltflex(reponse.status, (await corpsJson(reponse)) as ReponseDemarrage);
  },

  async verifierStatut(reference: string, cleApi: string): Promise<StatutGeneration> {
    const reponse = await fetch(`${base()}/floorplan-to-3d?taskId=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${cleApi}`, Accept: "application/json" },
    });
    return lireReponseStatutMeltflex(reponse.status, (await corpsJson(reponse)) as ReponseStatut);
  },
};
