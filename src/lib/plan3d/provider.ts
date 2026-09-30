/*
 * Génération d'un modèle 3D (.glb) à partir de l'image d'un plan 2D par un
 * fournisseur externe, derrière une interface commune. Chaque fournisseur est
 * un adaptateur (meltflex.ts, neural4d.ts) qui traduit ses deux appels —
 * démarrer une génération, vérifier son état — vers le contrat ci-dessous ;
 * le reste de l'application (bac à sable du Super Admin, générations sur les
 * biens) ne connaît que ce contrat.
 *
 * Ajouter un fournisseur : implémenter FournisseurPlan3d dans un nouveau
 * fichier, l'inscrire dans FOURNISSEURS et dans le registre de
 * fournisseurPlan3d(). Rien d'autre à toucher (voir ARCHITECTURE.md).
 */

export type Fournisseur = "MELTFLEX" | "NEURAL4D";

export const FOURNISSEURS: readonly { code: Fournisseur; libelle: string; site: string }[] = [
  { code: "MELTFLEX", libelle: "MeltFlex", site: "https://www.meltflexai.com/api" },
  { code: "NEURAL4D", libelle: "Neural4D", site: "https://docs.neural4d.com" },
];

export function estFournisseur(valeur: string): valeur is Fournisseur {
  return FOURNISSEURS.some((f) => f.code === valeur);
}

export function libelleFournisseur(code: string) {
  return FOURNISSEURS.find((f) => f.code === code)?.libelle ?? code;
}

/** Image du plan telle qu'elle est stockée (PNG ou JPEG uniquement : les fournisseurs ne lisent pas le PDF). */
export type ImagePlan = { octets: Uint8Array; mime: "image/png" | "image/jpeg"; nomFichier: string };

/** Résultat du démarrage : déjà prêt (réponse synchrone) ou en cours avec une référence à interroger. */
export type Demarrage = { etat: "pret"; modelUrl: string } | { etat: "en_cours"; reference: string };

export type StatutGeneration =
  | { etat: "en_cours"; progression?: number }
  | { etat: "pret"; modelUrl: string }
  | { etat: "echec"; message: string };

export interface FournisseurPlan3d {
  readonly code: Fournisseur;
  /** Envoie l'image et démarre la génération. Lève ErreurFournisseur si l'appel est refusé (clé, crédits, format…). */
  demarrerGeneration(image: ImagePlan, cleApi: string): Promise<Demarrage>;
  /** Interroge l'état d'une génération démarrée. */
  verifierStatut(reference: string, cleApi: string): Promise<StatutGeneration>;
}

/** Erreur d'appel au fournisseur, avec un message déjà lisible par l'utilisateur. */
export class ErreurFournisseur extends Error {
  constructor(
    message: string,
    public readonly statutHttp?: number,
  ) {
    super(message);
    this.name = "ErreurFournisseur";
  }
}

/** Message utilisateur pour un code HTTP de refus, commun aux fournisseurs. */
export function messageHttp(statut: number, fournisseur: string): string {
  switch (statut) {
    case 401:
    case 403:
      return `${fournisseur} refuse la clé d'API (non autorisé). Vérifiez la clé dans /admin/plan3d.`;
    case 402:
      return `${fournisseur} : crédits insuffisants sur le compte.`;
    case 429:
      return `${fournisseur} : trop de demandes en peu de temps, réessayez plus tard.`;
    case 400:
      return `${fournisseur} : image ou requête refusée (format ou champ invalide).`;
    default:
      return `${fournisseur} a répondu ${statut}.`;
  }
}
