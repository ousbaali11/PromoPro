/*
 * Génération d'un modèle 3D (.glb) à partir de l'image d'un plan 2D, derrière
 * une interface commune. Chaque fournisseur est un adaptateur (meltflex.ts,
 * neural4d.ts, promopro.ts) qui traduit ses appels — démarrer une génération,
 * vérifier son état — vers le contrat ci-dessous ; le reste de l'application
 * (bac à sable du Super Admin, générations sur les biens) ne connaît que ce
 * contrat.
 *
 * Ajouter un fournisseur : implémenter FournisseurPlan3d dans un nouveau
 * fichier, l'inscrire dans FOURNISSEURS et dans le registre de
 * fournisseurPlan3d(). Rien d'autre à toucher (voir ARCHITECTURE.md).
 */

export type Fournisseur = "MELTFLEX" | "NEURAL4D" | "PROMOPRO";

export type DescriptionFournisseur = {
  code: Fournisseur;
  libelle: string;
  site: string;
  /** Faux pour un modèle interne : aucune clé d'API à saisir. */
  necessiteCle: boolean;
  /** Faux tant que le fournisseur n'a pas été validé sur de vrais plans : testable dans le bac à sable, jamais actif pour les biens. */
  activable: boolean;
  /** État affiché quand le fournisseur n'est pas activable. */
  etat?: string;
  /** Vrai si le modèle rendu arrive sans couleur : la palette commune (palette.ts) lui est appliquée au téléchargement. */
  recolorer?: boolean;
  description?: string;
};

export const FOURNISSEURS: readonly DescriptionFournisseur[] = [
  { code: "MELTFLEX", libelle: "MeltFlex", site: "https://www.meltflexai.com/api", necessiteCle: true, activable: true },
  { code: "NEURAL4D", libelle: "Neural4D", site: "https://docs.neural4d.com", necessiteCle: true, activable: true, recolorer: true },
  {
    code: "PROMOPRO",
    libelle: "Solution PromoPro",
    site: "IA-INTERNE.md",
    necessiteCle: false,
    activable: false,
    etat: "En développement — testable dans le bac à sable, pas encore activable pour les biens",
    description:
      "Modèle interne (segmentation des murs, portes et fenêtres, puis extrusion), exécuté sur le serveur sans service tiers ni clé. Activable pour les biens une fois validé sur de vrais plans.",
  },
];

export function estFournisseur(valeur: string): valeur is Fournisseur {
  return FOURNISSEURS.some((f) => f.code === valeur);
}

export function descriptionFournisseur(code: string): DescriptionFournisseur | undefined {
  return FOURNISSEURS.find((f) => f.code === code);
}

export function libelleFournisseur(code: string) {
  return descriptionFournisseur(code)?.libelle ?? code;
}

/** Image du plan telle qu'elle est stockée (PNG ou JPEG uniquement : les fournisseurs ne lisent pas le PDF). */
export type ImagePlan = { octets: Uint8Array; mime: "image/png" | "image/jpeg"; nomFichier: string };

/**
 * Résultat du démarrage : déjà prêt (réponse synchrone) ou en cours avec une
 * référence à interroger. Un `modelUrl` commençant par /api/files/ désigne un
 * fichier déjà enregistré dans le stockage de l'application (fournisseur
 * interne) ; sinon c'est une adresse à télécharger.
 */
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
