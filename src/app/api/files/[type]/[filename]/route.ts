import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { isSafeFilename, isUploadType, mimeFor, readUpload } from "@/lib/storage";
import { clientCanAccessFile } from "@/lib/file-access";

/**
 * GET /api/files/[type]/[filename] — sert un fichier uploadé.
 * - Staff : accès à tout fichier (les noms sont des uuid, non devinables).
 * - Client : uniquement les fichiers rattachés à son dossier (voir file-access.ts).
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[type]/[filename]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { type, filename } = await ctx.params;
  if (!isUploadType(type) || !isSafeFilename(filename)) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  if (session.kind === "client") {
    const ok = await clientCanAccessFile(session.clientId, `/api/files/${type}/${filename}`);
    if (!ok) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const data = await readUpload(type, filename);
  if (!data) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFor(filename),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
