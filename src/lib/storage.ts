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
] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

export const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "storage", "uploads");

// Nom de fichier généré par nous : uuid + extension autorisée, rien d'autre
// (protège contre toute traversée de répertoire lors de la lecture).
const SAFE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$/;

export function isUploadType(value: string): value is UploadType {
  return (UPLOAD_TYPES as readonly string[]).includes(value);
}

export function isSafeFilename(value: string) {
  return SAFE_FILENAME.test(value);
}

export function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedExtension(filename: string) {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
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
  const m = url.match(/^\/api\/files\/([a-z-]+)\/([^/]+)$/);
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
  if (!isAllowedExtension(originalName)) {
    throw new Error("Extension non autorisée (pdf, jpg, jpeg, png uniquement).");
  }
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
