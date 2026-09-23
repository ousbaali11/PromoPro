import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { extensionsPour, isAllowedExtension, isUploadType, saveUpload, tailleMaxPour } from "@/lib/storage";

/**
 * POST /api/upload — FormData { file: File, type: UploadType }
 * Réservé aux utilisateurs connectés (staff ou client). Retourne { path, name }.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const type = String(formData.get("type") ?? "");
  const file = formData.get("file");

  if (!isUploadType(type)) return NextResponse.json({ error: "Type de document inconnu." }, { status: 400 });
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
  const path = await saveUpload(type, file.name, data);
  return NextResponse.json({ path, name: file.name });
}
