/*
 * Règles d'upload partagées entre le serveur (src/lib/storage.ts, /api/upload)
 * et le navigateur (composant FileUpload) : types de documents, extensions,
 * tailles maximales et messages utilisateur. Aucun import Node ici, pour que
 * le composant client puisse vérifier la taille AVANT d'envoyer le fichier.
 */

export const UPLOAD_TYPES = [
  "pieces-identite",
  "preuves-paiement",
  "plans",
  "desistements",
  "contrats",
  "photos-avancement",
  "recus",
  "autorisations-visite",
  "plans-3d", // modèles .glb / .gltf
  "tma-croquis", // photo ou croquis joint à une demande de travaux modificatifs
  "tma-devis", // devis PDF du SAV
  "logos", // logo du promoteur (PNG / JPG, déposé par le Super Admin) : en-tête des PDF et de l'espace client
] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

export const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
/** Extensions acceptées par type ; par défaut PDF / image, modèles 3D pour `plans-3d`. */
export const EXTENSIONS_PAR_TYPE: Partial<Record<UploadType, readonly string[]>> = {
  "plans-3d": ["glb", "gltf"],
  logos: ["png", "jpg", "jpeg"], // pdf-lib n'embarque que PNG et JPEG
};
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo
export const MAX_FILE_SIZE_3D = 50 * 1024 * 1024; // 50 Mo pour un modèle 3D
/** Marge accordée à l'enveloppe multipart (limites, en-têtes, champ `type`) lors du contrôle de `Content-Length`. */
export const MARGE_MULTIPART = 64 * 1024;

export function tailleMaxPour(type: UploadType) {
  return type === "plans-3d" ? MAX_FILE_SIZE_3D : MAX_FILE_SIZE;
}
export function extensionsPour(type: UploadType): readonly string[] {
  return EXTENSIONS_PAR_TYPE[type] ?? ALLOWED_EXTENSIONS;
}

/** Types qu'une session client peut déposer (preuve de paiement, pièce du porteur, croquis TMA) ; le reste est réservé au staff. */
export const TYPES_UPLOAD_CLIENT: readonly UploadType[] = ["preuves-paiement", "pieces-identite", "tma-croquis"];

export function isUploadType(value: string): value is UploadType {
  return (UPLOAD_TYPES as readonly string[]).includes(value);
}

export function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedExtension(filename: string, type?: UploadType) {
  const autorisees = type ? extensionsPour(type) : ALLOWED_EXTENSIONS;
  return autorisees.includes(extensionOf(filename));
}

/* Messages affichés à l'utilisateur (identiques côté serveur et côté navigateur). */
export function messageTropVolumineux(max: number) {
  return `Fichier trop volumineux (${Math.round(max / 1024 / 1024)} Mo maximum).`;
}
export function messageFormatRefuse(type: UploadType) {
  return `Format non accepté : ${extensionsPour(type).map((e) => e.toUpperCase()).join(", ")} uniquement.`;
}
/** Le disque des uploads (UPLOAD_DIR, volume monté en production) refuse l'écriture. */
export const MESSAGE_STOCKAGE_INDISPONIBLE =
  "Le stockage des fichiers est temporairement indisponible, contactez l'administrateur.";
/** Toute autre défaillance (réponse vide, non JSON, réseau coupé, erreur serveur inattendue). */
export const MESSAGE_ENVOI_ECHOUE = "Le fichier n'a pas pu être envoyé, réessayez ou contactez le support.";
