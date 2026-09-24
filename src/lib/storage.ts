import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_TYPES, extensionOf, extensionsPour, isAllowedExtension, isUploadType, type UploadType } from "@/lib/uploads-regles";

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
 *
 * Les sous-dossiers par type sont créés à la volée (`mkdir` récursif) à
 * chaque écriture, et d'avance au démarrage par `verifierStockage`
 * (src/instrumentation.ts). Toute défaillance du disque (EACCES sur un volume
 * appartenant à root, ENOSPC, ENOTDIR…) est levée sous la forme d'une
 * `ErreurStockage`, que les appelants traduisent en message utilisateur
 * (`MESSAGE_STOCKAGE_INDISPONIBLE`) tout en gardant le détail pour Sentry.
 *
 * Les règles partagées avec le navigateur (types, extensions, tailles,
 * messages) vivent dans src/lib/uploads-regles.ts et sont ré-exportées ici.
 */

export {
  UPLOAD_TYPES,
  ALLOWED_EXTENSIONS,
  EXTENSIONS_PAR_TYPE,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_3D,
  MARGE_MULTIPART,
  TYPES_UPLOAD_CLIENT,
  MESSAGE_STOCKAGE_INDISPONIBLE,
  MESSAGE_ENVOI_ECHOUE,
  tailleMaxPour,
  extensionsPour,
  isUploadType,
  extensionOf,
  isAllowedExtension,
  messageTropVolumineux,
  messageFormatRefuse,
} from "@/lib/uploads-regles";
export type { UploadType } from "@/lib/uploads-regles";

/** Défaillance du disque des uploads : le détail technique (code, appel système, chemin) est réservé aux journaux et à Sentry. */
export class ErreurStockage extends Error {
  readonly code: string;
  readonly syscall: string;
  readonly chemin: string;
  constructor(cause: unknown, chemin: string) {
    const e = (cause ?? {}) as { code?: string; syscall?: string; path?: string; message?: string };
    super(`Stockage des uploads inaccessible (${e.code ?? "?"} ${e.syscall ?? "?"} ${e.path ?? chemin}) : ${e.message ?? String(cause)}`);
    this.name = "ErreurStockage";
    this.code = e.code ?? "INCONNU";
    this.syscall = e.syscall ?? "?";
    this.chemin = e.path ?? chemin;
  }
}
export function estErreurStockage(e: unknown): e is ErreurStockage {
  return e instanceof ErreurStockage || (e instanceof Error && e.name === "ErreurStockage");
}

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
      return /^﻿?\s*\{/.test(texte(16));
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

/** Racine des uploads : `UPLOAD_DIR` (lu à chaque appel, pour les tests) sinon `storage/uploads` du projet. */
export function racineUploads() {
  return process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(process.cwd(), "storage", "uploads");
}

// Nom de fichier généré par nous : uuid + extension autorisée, rien d'autre
// (protège contre toute traversée de répertoire lors de la lecture).
const SAFE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|glb|gltf)$/;

export function isSafeFilename(value: string) {
  return SAFE_FILENAME.test(value);
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
  return path.join(racineUploads(), type, filename);
}

/**
 * Écrit un fichier (déjà validé côté appelant pour la taille) dans le bon
 * sous-dossier et retourne son chemin public. Lève `ErreurStockage` si le
 * disque refuse la création du dossier ou l'écriture.
 */
export async function saveUpload(type: UploadType, originalName: string, data: Buffer | Uint8Array) {
  if (!isAllowedExtension(originalName, type)) {
    throw new Error(`Extension non autorisée pour ${type} (${extensionsPour(type).join(", ")} uniquement).`);
  }
  if (!contenuCoherent(originalName, data)) throw new Error("Le contenu du fichier ne correspond pas à son extension.");
  const filename = `${crypto.randomUUID()}.${extensionOf(originalName)}`;
  const dossier = path.join(racineUploads(), type);
  try {
    await fs.mkdir(dossier, { recursive: true });
    await fs.writeFile(diskPath(type, filename), data);
  } catch (e) {
    throw new ErreurStockage(e, dossier);
  }
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

export const MESSAGE_UPLOAD_DIR_INACCESSIBLE =
  "UPLOAD_DIR n'est pas accessible en écriture : vérifiez le volume Railway et ses permissions";

/**
 * Vérifie que la racine des uploads est inscriptible : crée la racine et
 * chaque sous-dossier par type, écrit puis supprime un fichier témoin.
 * Appelée au démarrage (src/instrumentation.ts) pour signaler un volume mal
 * monté avant qu'un utilisateur ne tombe dessus, et avant toute opération qui
 * doit écrire un PDF après une mise à jour en base (`exigerStockageInscriptible`).
 */
export async function verifierStockage(
  racine = racineUploads(),
): Promise<{ ok: true; racine: string } | { ok: false; racine: string; message: string; erreur: ErreurStockage }> {
  const temoin = path.join(racine, `.verification-ecriture-${process.pid}-${Date.now()}`);
  try {
    await fs.mkdir(racine, { recursive: true });
    for (const type of UPLOAD_TYPES) await fs.mkdir(path.join(racine, type), { recursive: true });
    await fs.writeFile(temoin, "ok");
    await fs.unlink(temoin);
    return { ok: true, racine };
  } catch (e) {
    const erreur = new ErreurStockage(e, racine);
    return {
      ok: false,
      racine,
      erreur,
      message: `${MESSAGE_UPLOAD_DIR_INACCESSIBLE} (${racine} : ${erreur.code} ${erreur.syscall} ${erreur.chemin}).`,
    };
  }
}

/** Lève `ErreurStockage` si le disque des uploads n'est pas inscriptible ; à appeler avant une écriture en base qui exige ensuite un PDF. */
export async function exigerStockageInscriptible() {
  const etat = await verifierStockage();
  if (!etat.ok) throw etat.erreur;
}
