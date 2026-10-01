import { extensionOf, mimeFor, parsePublicPath, readUpload, saveUpload } from "@/lib/storage";
import { appliquerPalette } from "./palette";
import { fournisseurPlan3d } from "./registre";
import { descriptionFournisseur, ErreurFournisseur, type Fournisseur, type ImagePlan, type StatutGeneration } from "./provider";

/*
 * Exécution d'une génération, commune au bac à sable et aux biens :
 * lecture de l'image du plan, démarrage chez le fournisseur, interrogation
 * périodique jusqu'au résultat, téléchargement du .glb et enregistrement dans
 * le stockage de l'application (type « plans-3d », mêmes règles d'accès que
 * les fichiers déposés). Chaque étape est bornée (délai global, taille du
 * fichier) et toute erreur devient un résultat « echec » avec un message
 * lisible : la génération ne fait jamais échouer la page qui l'a déclenchée.
 */

export const DELAI_MAX_MS = Number(process.env.PLAN3D_DELAI_MAX_MS) || 10 * 60_000;
export const INTERVALLE_MS = Number(process.env.PLAN3D_INTERVALLE_MS) || 5_000;
export const TAILLE_MAX_MODELE = 50 * 1024 * 1024;

/** Fenêtre minimale entre deux générations automatiques pour un même bien. */
export const FENETRE_GENERATION_MS = 24 * 60 * 60 * 1000;

export type ResultatGeneration = { etat: "pret"; modelUrl: string; dureeMs: number } | { etat: "echec"; message: string; dureeMs: number };

/** Une génération automatique est possible si aucune n'a été créée pour ce bien depuis 24 h (règle pure, testée). */
export function generationAutorisee(derniereCreation: Date | number | string | null | undefined, now = new Date()) {
  if (!derniereCreation) return true;
  return now.getTime() - new Date(derniereCreation).getTime() >= FENETRE_GENERATION_MS;
}

export const MESSAGE_FORMAT_NON_SUPPORTE = "Le plan doit être une image PNG ou JPEG : les fournisseurs ne lisent pas le PDF.";

/** Image du plan depuis son chemin public, ou une raison de refus. */
export async function imageDuPlan(planUrl: string): Promise<{ image: ImagePlan } | { erreur: string }> {
  const chemin = parsePublicPath(planUrl);
  if (!chemin || chemin.type !== "plans") return { erreur: "Le plan n'est pas un fichier importé de l'application." };
  const ext = extensionOf(chemin.filename);
  if (!["png", "jpg", "jpeg"].includes(ext)) return { erreur: MESSAGE_FORMAT_NON_SUPPORTE };
  const octets = await readUpload(chemin.type, chemin.filename);
  if (!octets) return { erreur: "Le fichier du plan est introuvable sur le disque." };
  return { image: { octets, mime: mimeFor(chemin.filename) as ImagePlan["mime"], nomFichier: chemin.filename } };
}

function attendre(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Télécharge le modèle chez le fournisseur et l'enregistre comme fichier
 * « plans-3d » de l'application ; la palette commune est appliquée aux .glb
 * des fournisseurs qui le demandent (drapeau `recolorer`).
 */
export async function rapatrierModele(modelUrl: string, fournisseur?: Fournisseur): Promise<string> {
  if (modelUrl.startsWith("/api/files/")) return modelUrl; // déjà enregistré par un fournisseur interne
  const reponse = await fetch(modelUrl);
  if (!reponse.ok) throw new ErreurFournisseur(`Le fichier du modèle n'a pas pu être téléchargé (${reponse.status}).`, reponse.status);
  let octets = Buffer.from(await reponse.arrayBuffer());
  if (octets.length === 0) throw new ErreurFournisseur("Le fichier du modèle est vide.");
  if (octets.length > TAILLE_MAX_MODELE) throw new ErreurFournisseur("Le modèle dépasse 50 Mo.");
  const estGlb = octets.subarray(0, 4).toString("ascii") === "glTF";
  if (estGlb && fournisseur && descriptionFournisseur(fournisseur)?.recolorer) octets = appliquerPalette(octets);
  const nom = estGlb ? "modele.glb" : "modele.gltf";
  return saveUpload("plans-3d", nom, octets); // contenuCoherent vérifie la signature du fichier
}

/**
 * Démarre puis suit une génération jusqu'au résultat. `onReference` reçoit
 * l'identifiant de tâche du fournisseur dès qu'il est connu (stocké pour une
 * reprise après redémarrage du serveur).
 */
export async function executerGeneration(
  fournisseur: Fournisseur,
  cleApi: string,
  image: ImagePlan,
  onReference?: (reference: string) => Promise<void> | void,
): Promise<ResultatGeneration> {
  const debut = Date.now();
  const duree = () => Date.now() - debut;
  try {
    const adaptateur = fournisseurPlan3d(fournisseur);
    const demarrage = await adaptateur.demarrerGeneration(image, cleApi);
    if (demarrage.etat === "pret") return { etat: "pret", modelUrl: await rapatrierModele(demarrage.modelUrl, fournisseur), dureeMs: duree() };
    await onReference?.(demarrage.reference);
    const suivi = await suivreJusquAuResultat(fournisseur, cleApi, demarrage.reference, debut);
    if (suivi.etat === "pret") return { etat: "pret", modelUrl: await rapatrierModele(suivi.modelUrl, fournisseur), dureeMs: duree() };
    return { etat: "echec", message: suivi.message, dureeMs: duree() };
  } catch (e) {
    return { etat: "echec", message: messageErreur(e), dureeMs: duree() };
  }
}

/** Reprise d'une génération déjà démarrée (référence connue) : utile après un redémarrage du serveur. */
export async function reprendreGeneration(fournisseur: Fournisseur, cleApi: string, reference: string, demarreeA: Date | number | string): Promise<ResultatGeneration | null> {
  const debut = new Date(demarreeA).getTime();
  try {
    const statut = await fournisseurPlan3d(fournisseur).verifierStatut(reference, cleApi);
    if (statut.etat === "pret") return { etat: "pret", modelUrl: await rapatrierModele(statut.modelUrl, fournisseur), dureeMs: Date.now() - debut };
    if (statut.etat === "echec") return { etat: "echec", message: statut.message, dureeMs: Date.now() - debut };
    if (Date.now() - debut > DELAI_MAX_MS) return { etat: "echec", message: MESSAGE_DELAI, dureeMs: Date.now() - debut };
    return null; // toujours en cours
  } catch (e) {
    return { etat: "echec", message: messageErreur(e), dureeMs: Date.now() - debut };
  }
}

export const MESSAGE_DELAI = "Le fournisseur n'a pas rendu de modèle dans le délai imparti.";

async function suivreJusquAuResultat(fournisseur: Fournisseur, cleApi: string, reference: string, debut: number): Promise<Exclude<StatutGeneration, { etat: "en_cours" }>> {
  const adaptateur = fournisseurPlan3d(fournisseur);
  while (Date.now() - debut < DELAI_MAX_MS) {
    await attendre(INTERVALLE_MS);
    const statut = await adaptateur.verifierStatut(reference, cleApi);
    if (statut.etat !== "en_cours") return statut;
  }
  return { etat: "echec", message: MESSAGE_DELAI };
}

export function messageErreur(e: unknown): string {
  if (e instanceof ErreurFournisseur) return e.message;
  if (e instanceof Error) {
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(e.message)) return "Le fournisseur est injoignable (réseau).";
    return e.message;
  }
  return "Erreur inconnue.";
}
