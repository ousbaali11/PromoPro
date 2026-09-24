import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSessionActive } from "@/lib/session";
import {
  contenuCoherent,
  estErreurStockage,
  isAllowedExtension,
  isUploadType,
  MARGE_MULTIPART,
  MAX_FILE_SIZE_3D,
  MESSAGE_ENVOI_ECHOUE,
  MESSAGE_STOCKAGE_INDISPONIBLE,
  messageFormatRefuse,
  messageTropVolumineux,
  saveUpload,
  tailleMaxPour,
  TYPES_UPLOAD_CLIENT,
} from "@/lib/storage";
import { consommer, LIMITES, messageLimite } from "@/lib/rate-limit";

/**
 * POST /api/upload?type=<UploadType> — FormData { file: File, type: UploadType }
 * Réservé aux comptes connectés et actifs (staff ou client) ; un client ne
 * dépose que les types qui le concernent. Extension, taille et signature du
 * contenu sont contrôlées ici, côté serveur ; 30 dépôts par compte et par
 * 10 minutes. Retourne { path, name }.
 *
 * Contrat de réponse : **toujours du JSON**, `{ path, name }` en succès,
 * `{ error }` sinon — y compris quand le disque des uploads refuse l'écriture
 * (503, MESSAGE_STOCKAGE_INDISPONIBLE) ou qu'une erreur inattendue survient
 * (500, MESSAGE_ENVOI_ECHOUE). Le détail technique va dans Sentry et les
 * journaux, jamais au navigateur. Un plantage brut renvoyait un 500 sans corps,
 * que le composant FileUpload affichait comme « Unexpected end of JSON input ».
 *
 * La taille est vérifiée le plus tôt possible : sur `Content-Length` (avec le
 * type annoncé dans l'URL) avant même de lire le corps, puis sur le fichier
 * réel après lecture.
 */
export async function POST(req: NextRequest) {
  try {
    return await traiter(req);
  } catch (e) {
    if (estErreurStockage(e)) {
      console.error(`[stockage] /api/upload : ${e.message}`);
      Sentry.captureException(e, { tags: { route: "/api/upload", stockage: "uploads" } });
      return NextResponse.json({ error: MESSAGE_STOCKAGE_INDISPONIBLE }, { status: 503 });
    }
    console.error("[upload] erreur inattendue :", e);
    Sentry.captureException(e, { tags: { route: "/api/upload" } });
    return NextResponse.json({ error: MESSAGE_ENVOI_ECHOUE }, { status: 500 });
  }
}

async function traiter(req: NextRequest) {
  const session = await getSessionActive();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const cle = session.kind === "staff" ? `upload:user:${session.userId}` : `upload:client:${session.clientId}`;
  const limite = consommer(cle, LIMITES.upload.max, LIMITES.upload.fenetreMs);
  if (!limite.autorise) return NextResponse.json({ error: messageLimite(limite.reessaiDansSec) }, { status: 429 });

  // Contrôle précoce : la taille annoncée par le navigateur, avant de charger le corps en mémoire
  const typeAnnonce = req.nextUrl.searchParams.get("type") ?? "";
  const maxAnnonce = isUploadType(typeAnnonce) ? tailleMaxPour(typeAnnonce) : MAX_FILE_SIZE_3D;
  const contentLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxAnnonce + MARGE_MULTIPART) {
    return NextResponse.json({ error: messageTropVolumineux(maxAnnonce) }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const type = String(formData.get("type") ?? "");
  const file = formData.get("file");

  if (!isUploadType(type)) return NextResponse.json({ error: "Type de document inconnu." }, { status: 400 });
  if (session.kind === "client" && !TYPES_UPLOAD_CLIENT.includes(type)) {
    return NextResponse.json({ error: "Ce type de document n'est pas déposable depuis l'espace client." }, { status: 403 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (!isAllowedExtension(file.name, type)) {
    return NextResponse.json({ error: messageFormatRefuse(type) }, { status: 400 });
  }
  const max = tailleMaxPour(type);
  if (file.size > max) {
    return NextResponse.json({ error: messageTropVolumineux(max) }, { status: 400 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (!contenuCoherent(file.name, data)) {
    return NextResponse.json({ error: "Le contenu du fichier ne correspond pas à son extension." }, { status: 400 });
  }
  const path = await saveUpload(type, file.name, data);
  return NextResponse.json({ path, name: file.name });
}
