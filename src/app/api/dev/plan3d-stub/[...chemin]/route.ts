import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/*
 * Simulateur des fournisseurs de modèles 3D, **hors production seulement**
 * (404 en production). La suite e2e pointe MELTFLEX_API_URL et NEURAL4D_API_URL
 * vers /api/dev/plan3d-stub/meltflex et /api/dev/plan3d-stub/neural4d : les
 * adaptateurs réels (src/lib/plan3d/) sont exercés de bout en bout, avec les
 * mêmes formes de requête et de réponse que les API documentées.
 *
 * Règles du simulateur :
 * - clé « cle-invalide » → 401 ;
 * - image PNG de largeur 2 px (PNG_ECHEC des tests) → échec de conversion
 *   (MeltFlex : 502 ; Neural4D : codeStatus -3 au suivi) ;
 * - sinon, première interrogation « en cours », la suivante « prêt » avec un
 *   modèle .glb (tests/fixtures/cube.glb) servi par le simulateur.
 */

type Tache = { interrogations: number; echec: boolean };
const g = globalThis as unknown as { __promoproStubPlan3d?: Map<string, Tache> };
const taches: Map<string, Tache> = g.__promoproStubPlan3d ?? new Map();
g.__promoproStubPlan3d = taches;

function largeurPng(octets: Uint8Array) {
  if (octets.length < 24 || octets[1] !== 0x50 || octets[2] !== 0x4e || octets[3] !== 0x47) return 0;
  return (octets[16] << 24) | (octets[17] << 16) | (octets[18] << 8) | octets[19];
}

function cleValide(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") && auth !== "Bearer cle-invalide";
}

function nouvelleTache(echec: boolean) {
  const id = crypto.randomUUID();
  taches.set(id, { interrogations: 0, echec });
  return id;
}

function urlModele(req: NextRequest) {
  return `${req.nextUrl.origin}/api/dev/plan3d-stub/modele.glb`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ chemin: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const chemin = (await ctx.params).chemin.join("/");

  if (chemin === "modele.glb") {
    const cube = readFileSync(path.join(process.cwd(), "tests", "fixtures", "cube.glb"));
    return new NextResponse(new Uint8Array(cube), { headers: { "Content-Type": "model/gltf-binary" } });
  }
  if (chemin === "meltflex/floorplan-to-3d") {
    if (!cleValide(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const taskId = req.nextUrl.searchParams.get("taskId") ?? "";
    const tache = taches.get(taskId);
    if (!tache) return NextResponse.json({ success: false, status: "FAILED", taskId, error: "unknown task" });
    tache.interrogations++;
    if (tache.interrogations < 2) return NextResponse.json({ success: false, status: "IN_PROGRESS", taskId, progress: 50 });
    return NextResponse.json({ success: true, status: "SUCCEEDED", taskId, progress: 100, modelUrl: urlModele(req), format: "glb", textured: false, creditsUsed: 100 });
  }
  return new NextResponse(null, { status: 404 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ chemin: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const chemin = (await ctx.params).chemin.join("/");

  if (chemin === "meltflex/floorplan-to-3d") {
    if (!cleValide(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const corps = (await req.json()) as { image?: string; output?: string };
    const base64 = corps.image?.split(",")[1] ?? "";
    if (!base64 || corps.output !== "model") return NextResponse.json({ error: "Missing or invalid field: image" }, { status: 400 });
    if (largeurPng(Buffer.from(base64, "base64")) === 2) return NextResponse.json({ error: "Conversion Failed: no walls detected" }, { status: 502 });
    const taskId = nouvelleTache(false);
    return NextResponse.json({ success: false, output: "model", status: "IN_PROGRESS", taskId, progress: 0, creditsUsed: 100 }, { status: 202 });
  }

  if (chemin === "neural4d/generateModelWithImage") {
    if (!cleValide(req)) return new NextResponse("Unauthorized", { status: 401 });
    const form = await req.formData();
    const image = form.get("image");
    if (!(image instanceof File) || form.get("mesh_quality") === null) {
      return NextResponse.json({ errors: [{ type: "field", msg: "image is required", path: "image", location: "body" }] }, { status: 400 });
    }
    const echec = largeurPng(new Uint8Array(await image.arrayBuffer())) === 2;
    const uuid = nouvelleTache(echec);
    return NextResponse.json({ type: "sys", message: "Generating", uuids: [uuid], uploadedImageUrl: `${req.nextUrl.origin}/stub/${uuid}.png` });
  }

  if (chemin === "neural4d/retrieveModel") {
    if (!cleValide(req)) return NextResponse.json({ codeStatus: -1, message: "Invalid token" });
    const { uuid } = (await req.json()) as { uuid?: string };
    const tache = taches.get(uuid ?? "");
    if (!tache) return NextResponse.json({ codeStatus: -2, message: "UUID does not exist" });
    tache.interrogations++;
    if (tache.interrogations < 2) return NextResponse.json({ codeStatus: 1, message: "Generating" });
    if (tache.echec) return NextResponse.json({ codeStatus: -3, message: "Generation failed" });
    return NextResponse.json({ codeStatus: 0, message: "Generate model success", modelUrl: urlModele(req), createdAt: new Date().toISOString() });
  }

  return new NextResponse(null, { status: 404 });
}
