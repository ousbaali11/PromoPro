import { NextResponse, type NextRequest } from "next/server";
import { getSessionActive } from "@/lib/session";
import { contenuCoherent, extensionsPour, isAllowedExtension, isUploadType, saveUpload, tailleMaxPour, TYPES_UPLOAD_CLIENT } from "@/lib/storage";
import { consommer, LIMITES, messageLimite } from "@/lib/rate-limit";

/**
 * POST /api/upload — FormData { file: File, type: UploadType }
 * Réservé aux comptes connectés et actifs (staff ou client) ; un client ne
 * dépose que les types qui le concernent. Extension, taille et signature du
 * contenu sont contrôlées ici, côté serveur ; 30 dépôts par compte et par
 * 10 minutes. Retourne { path, name }.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionActive();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const cle = session.kind === "staff" ? `upload:user:${session.userId}` : `upload:client:${session.clientId}`;
  const limite = consommer(cle, LIMITES.upload.max, LIMITES.upload.fenetreMs);
  if (!limite.autorise) return NextResponse.json({ error: messageLimite(limite.reessaiDansSec) }, { status: 429 });

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
    return NextResponse.json(
      { error: `Format non accepté : ${extensionsPour(type).map((e) => e.toUpperCase()).join(", ")} uniquement.` },
      { status: 400 },
    );
  }
  const max = tailleMaxPour(type);
  if (file.size > max) {
    return NextResponse.json({ error: `Fichier trop volumineux (${Math.round(max / 1024 / 1024)} Mo maximum).` }, { status: 400 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (!contenuCoherent(file.name, data)) {
    return NextResponse.json({ error: "Le contenu du fichier ne correspond pas à son extension." }, { status: 400 });
  }
  const path = await saveUpload(type, file.name, data);
  return NextResponse.json({ path, name: file.name });
}
