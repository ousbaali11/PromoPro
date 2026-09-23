import fs from "node:fs/promises";
import path from "node:path";

/**
 * Stockage local des fichiers uploadés.
 *
 * Les fichiers sont écrits dans `storage/uploads/<type>/<uuid>.<ext>` à la
 * racine du projet (dossier ignoré par git) et servis via la route
 * `GET /api/files/<type>/<filename>` qui vérifie la session — jamais depuis
 * `/public`, pour garder le contrôle d'accès.
 *
 * En production, le dossier doit être sur un **disque persistant** (volume
 * monté) : définir `UPLOAD_DIR=/chemin/du/volume` (voir README). Pour un
 * déploiement sans disque persistant (serverless), remplacer `saveUpload` /
 * `readUpload` par un stockage objet S3-compatible — le reste du code ne
 * manipule que des chemins publics `/api/files/...`, rien d'autre ne change.
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
] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

export const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
/** Extensions acceptées par type ; par défaut PDF / image, modèles 3D pour `plans-3d`. */
export const EXTENSIONS_PAR_TYPE: Partial<Record<UploadType, readonly string[]>> = {
  "plans-3d": ["glb", "gltf"],
};
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo
export const MAX_FILE_SIZE_3D = 50 * 1024 * 1024; // 50 Mo pour un modèle 3D
export function tailleMaxPour(type: UploadType) {
  return type === "plans-3d" ? MAX_FILE_SIZE_3D : MAX_FILE_SIZE;
}
export function extensionsPour(type: UploadType): readonly string[] {
  return EXTENSIONS_PAR_TYPE[type] ?? ALLOWED_EXTENSIONS;
}

/** Types qu'une session client peut déposer (preuve de paiement, pièce du porteur, croquis TMA) ; le reste est réservé au staff. */
export const TYPES_UPLOAD_CLIENT: readonly UploadType[] = ["preuves-paiement", "pieces-identite", "tma-croquis"];

/**
 * Le contenu correspond-il à l'extension annoncée ? Signatures (magic bytes) :
 * PDF « %PDF », PNG 89 50 4E 47, JPEG FF D8 FF, GLB « glTF », glTF JSON « { ».
 * Empêche de stocker un fichier HTML ou un exécutable sous un nom d'image.
 */
export function contenuCoherent(filename: string, data: Uint8Array): boolean {
  const ext = extensionOf(filename);
  const debut = (n: number) => Array.from(data.subarray(0, n));
  const texte = (n: number) => new TextDecoder("utf8", { fatal: false }).decode(data.subarray(0, n));
  switch (ext) {
    case "pdf":
      return texte(4) === "%PDF";
    case "png":
      return debut(4).join(",") === "137,80,78,71";
    case "jpg":
    case "jpeg":
      return debut(3).join(",") === "255,216,255";
    case "glb":
      return texte(4) === "glTF";
    case "gltf":
      return /^\uFEFF?\s*\{/.test(texte(16));
    default:
      return false;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
};

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "storage", "uploads");

// Nom de fichier généré par nous : uuid + extension autorisée, rien d'autre
// (protège contre toute traversée de répertoire lors de la lecture).
const SAFE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|glb|gltf)$/;

export function isUploadType(value: string): value is UploadType {
  return (UPLOAD_TYPES as readonly string[]).includes(value);
}

export function isSafeFilename(value: string) {
  return SAFE_FILENAME.test(value);
}

export function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedExtension(filename: string, type?: UploadType) {
  const autorisees = type ? extensionsPour(type) : ALLOWED_EXTENSIONS;
  return autorisees.includes(extensionOf(filename));
}

export function mimeFor(filename: string) {
  return MIME_BY_EXT[extensionOf(filename)] ?? "application/octet-stream";
}

/** Chemin public d'un fichier stocké, tel qu'enregistré en base. */
export function publicPath(type: UploadType, filename: string) {
  return `/api/files/${type}/${filename}`;
}

/** Inverse de `publicPath` : retrouve type + nom de fichier depuis un chemin public (ou null). */
export function parsePublicPath(url: string | null | undefined): { type: UploadType; filename: string } | null {
  if (!url) return null;
  // Types en minuscules, tirets et chiffres (« plans-3d ») ; la classe sans chiffre rejetait les modèles 3D
  const m = url.match(/^\/api\/files\/([a-z0-9-]+)\/([^/]+)$/);
  if (!m) return null;
  const [, type, filename] = m;
  if (!isUploadType(type) || !isSafeFilename(filename)) return null;
  return { type, filename };
}

function diskPath(type: UploadType, filename: string) {
  return path.join(UPLOAD_ROOT, type, filename);
}

/**
 * Écrit un fichier (déjà validé côté appelant pour la taille) dans le bon
 * sous-dossier et retourne son chemin public.
 */
export async function saveUpload(type: UploadType, originalName: string, data: Buffer | Uint8Array) {
  if (!isAllowedExtension(originalName, type)) {
    throw new Error(`Extension non autorisée pour ${type} (${extensionsPour(type).join(", ")} uniquement).`);
  }
  if (!contenuCoherent(originalName, data)) throw new Error("Le contenu du fichier ne correspond pas à son extension.");
  const filename = `${crypto.randomUUID()}.${extensionOf(originalName)}`;
  await fs.mkdir(path.join(UPLOAD_ROOT, type), { recursive: true });
  await fs.writeFile(diskPath(type, filename), data);
  return publicPath(type, filename);
}

/** Lit un fichier stocké, ou null s'il n'existe pas. */
export async function readUpload(type: UploadType, filename: string): Promise<Buffer | null> {
  if (!isSafeFilename(filename)) return null;
  try {
    return await fs.readFile(diskPath(type, filename));
  } catch {
    return null;
  }
}
