import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/*
 * Simulateur des fournisseurs de modèles 3D, **hors production seulement**
 * (404 en production). La suite e2e pointe GEMINI_API_URL et NEURAL4D_API_URL
 * vers /api/dev/plan3d-stub/gemini et /api/dev/plan3d-stub/neural4d : les
 * adaptateurs réels (src/lib/plan3d/) sont exercés de bout en bout, avec les
 * mêmes formes de requête et de réponse que les API documentées.
 *
 * Règles du simulateur :
 * - clé « cle-invalide » → Neural4D 401 ; Gemini 400 « API key not valid » ;
 * - image PNG de largeur 2 px (PNG_ECHEC des tests) → échec : Neural4D
 *   codeStatus -3 au suivi ; Gemini renvoie un JSON sans aucune pièce ;
 * - sinon, Neural4D : première interrogation « en cours », la suivante
 *   « prêt » avec un modèle .glb (tests/fixtures/cube.glb) servi par le
 *   simulateur ; Gemini : JSON de trois pièces nommées et une porte, que
 *   l'adaptateur extrude lui-même ; Gemini — rendu 3D (modèle dont le nom
 *   contient « image ») : une image PNG de teinte différente à chaque appel,
 *   que l'adaptateur assemble en planche.
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

/** Réponse Gemini : le JSON de structure est dans le texte du premier candidat. */
function reponseGemini(structure: unknown) {
  return NextResponse.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(structure) }], role: "model" }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 180, totalTokenCount: 1380 },
    modelVersion: "simulateur",
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ chemin: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const chemin = (await ctx.params).chemin.join("/");

  if (chemin === "modele.glb") {
    const cube = readFileSync(path.join(process.cwd(), "tests", "fixtures", "cube.glb"));
    return new NextResponse(new Uint8Array(cube), { headers: { "Content-Type": "model/gltf-binary" } });
  }
  return new NextResponse(null, { status: 404 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ chemin: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const chemin = (await ctx.params).chemin.join("/");

  if (/^gemini\/models\/[^/]+:generateContent$/.test(chemin)) {
    const cle = req.headers.get("x-goog-api-key") ?? "";
    if (!cle || cle === "cle-invalide") {
      return NextResponse.json({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }, { status: 400 });
    }
    const corps = (await req.json()) as { contents?: { parts?: { text?: string; inline_data?: { mime_type?: string; data?: string } }[] }[]; generationConfig?: { responseModalities?: string[] } };
    const image = corps.contents?.[0]?.parts?.find((p) => p.inline_data)?.inline_data;
    if (!image?.data) return NextResponse.json({ error: { code: 400, message: "Request must contain an image part.", status: "INVALID_ARGUMENT" } }, { status: 400 });
    if (/image/.test(chemin) || corps.generationConfig?.responseModalities?.includes("IMAGE")) {
      // Modèle d'image : une vue de teinte différente à chaque appel (sans image pour le PNG d'échec)
      if (largeurPng(Buffer.from(image.data, "base64")) === 2) {
        return NextResponse.json({ candidates: [{ content: { parts: [{ text: "Je ne vois aucun plan sur cette image." }], role: "model" }, finishReason: "STOP" }] });
      }
      const teinte = (taches.size * 60) % 360;
      taches.set(crypto.randomUUID(), { interrogations: 0, echec: false });
      const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 200 + (teinte % 50), g: 180, b: 120 + (teinte % 100) } } }).png().toBuffer();
      return NextResponse.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png.toString("base64") } }], role: "model" }, finishReason: "STOP" }], usageMetadata: { totalTokenCount: 1500 } });
    }
    if (largeurPng(Buffer.from(image.data, "base64")) === 2) return reponseGemini({ pieces: [], portes: [], remarques: "image illisible : aucun mur visible" });
    return reponseGemini({
      pieces: [
        { nom: "Salon", x: 0.05, y: 0.05, largeur: 0.55, hauteur: 0.5 },
        { nom: "Cuisine", x: 0.62, y: 0.05, largeur: 0.33, hauteur: 0.5 },
        { nom: "Chambre", x: 0.05, y: 0.57, largeur: 0.9, hauteur: 0.38 },
      ],
      portes: [{ x: 0.6, y: 0.3, mur: "vertical", relie: ["Salon", "Cuisine"] }],
      dimensions_m: { largeur: 12, hauteur: 9 },
      remarques: "simulateur",
    });
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
