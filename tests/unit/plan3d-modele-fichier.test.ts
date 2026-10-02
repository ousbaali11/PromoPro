import { mkdtemp, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cheminModele, modeleOnnxLisible, VARIANTES } from "@/lib/plan3d/inference";

/*
 * Lisibilité d'un fichier de modèle : un .safetensors (en-tête JSON précédé
 * de sa longueur) ou une page HTML déposés à la place du .onnx doivent être
 * reconnus comme illisibles — c'est ce qui déclenche leur suppression et le
 * retéléchargement. Le vrai modèle, s'il est installé, doit se charger.
 */
let dossier: string;
beforeAll(async () => {
  dossier = await mkdtemp(path.join(tmpdir(), "promopro-modele-"));
});
afterAll(async () => {
  await rm(dossier, { recursive: true, force: true });
});

describe("fichier de modèle ONNX", () => {
  it("un .safetensors ou une page HTML ne sont pas des modèles lisibles", async () => {
    const entete = Buffer.from(JSON.stringify({ "segmentation_head.0.bias": { dtype: "F32", shape: [4], data_offsets: [0, 16] } }));
    const longueur = Buffer.alloc(8);
    longueur.writeBigUInt64LE(BigInt(entete.length));
    const safetensors = path.join(dossier, "faux.onnx");
    await writeFile(safetensors, Buffer.concat([longueur, entete, Buffer.alloc(16)]));
    expect(await modeleOnnxLisible(safetensors)).toBe(false);
    const html = path.join(dossier, "page.onnx");
    await writeFile(html, "<!DOCTYPE html><html><body>Not Found</body></html>");
    expect(await modeleOnnxLisible(html)).toBe(false);
    expect(await modeleOnnxLisible(path.join(dossier, "absent.onnx"))).toBe(false);
  });

  it("le modèle installé (s'il est présent) se charge ; les variantes ont des fichiers et des variables distincts", async () => {
    const chemin = cheminModele("principal");
    const installe = await access(chemin).then(() => true, () => false);
    if (installe) expect(await modeleOnnxLisible(chemin)).toBe(true);
    expect(VARIANTES.principal.fichier).not.toBe(VARIANTES.b.fichier);
    expect(VARIANTES.principal.envUrl).not.toBe(VARIANTES.b.envUrl);
    expect(cheminModele("b")).not.toBe(chemin);
  });
});
