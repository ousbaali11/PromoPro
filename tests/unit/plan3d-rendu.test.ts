import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assemblerVues, lireImageGemini, modeleGeminiImage, PROMPT_PREMIERE_VUE, promptVueTournee } from "@/lib/plan3d/gemini-rendu";
import { angleDeLaVue, estRenduImage, HAUTEUR_VUE, LARGEUR_VUE, NB_VUES, nombreDeVues } from "@/lib/plan3d/rendu-vues";

describe("Gemini — rendu 3D : lecture des images et prompts", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

  it("rend la première image (inlineData) avec son type ; sans image, erreur reprenant le texte du modèle", () => {
    const lecture = lireImageGemini(200, { candidates: [{ content: { parts: [{ text: "Voici" }, { inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] });
    expect(lecture.mime).toBe("image/png");
    expect(lecture.octets.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(lireImageGemini(200, { candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/jpeg", data: png.toString("base64") } }] } }] }).mime).toBe("image/jpeg");
    expect(() => lireImageGemini(200, { candidates: [{ content: { parts: [{ text: "Je ne vois aucun plan." }] } }] })).toThrow(/aucun plan/);
    expect(() => lireImageGemini(200, {})).toThrow(/pas rendu d'image/);
    expect(() => lireImageGemini(400, { error: { message: "API key not valid" } })).toThrow(/clé d'API/);
  });

  it("les prompts demandent une maquette fidèle au plan, puis la même maquette tournée de l'angle voulu ; modèle d'image surchargeable", () => {
    expect(PROMPT_PREMIERE_VUE).toMatch(/maquette/);
    expect(PROMPT_PREMIERE_VUE).toMatch(/fond blanc/);
    expect(promptVueTournee(90)).toMatch(/90°/);
    expect(promptVueTournee(270)).toMatch(/Même maquette/);
    const avant = process.env.GEMINI_MODEL_IMAGE;
    process.env.GEMINI_MODEL_IMAGE = "image-test";
    expect(modeleGeminiImage()).toBe("image-test");
    if (avant === undefined) delete process.env.GEMINI_MODEL_IMAGE;
    else process.env.GEMINI_MODEL_IMAGE = avant;
    expect(modeleGeminiImage()).toMatch(/image/);
  });
});

describe("planche de vues", () => {
  it("assemble les vues côte à côte en 4:3 sur fond blanc, en JPEG, et le nombre de vues se retrouve d'après les dimensions", async () => {
    const vue = (couleur: { r: number; g: number; b: number }, largeur: number, hauteur: number) =>
      sharp({ create: { width: largeur, height: hauteur, channels: 3, background: couleur } }).png().toBuffer();
    const planche = await assemblerVues([await vue({ r: 200, g: 50, b: 50 }, 80, 60), await vue({ r: 50, g: 200, b: 50 }, 60, 80), await vue({ r: 50, g: 50, b: 200 }, 40, 30)]);
    const meta = await sharp(planche).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(LARGEUR_VUE * 3);
    expect(meta.height).toBe(HAUTEUR_VUE);
    expect(nombreDeVues(meta.width!, meta.height!)).toBe(3);
    // La deuxième vue (portrait) est centrée sur fond blanc : ses bords gauche et droit sont blancs, son centre vert
    const { data, info } = await sharp(planche).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    expect(pixel(LARGEUR_VUE + 10, HAUTEUR_VUE / 2).every((v) => v > 240)).toBe(true);
    const centre = pixel(LARGEUR_VUE + LARGEUR_VUE / 2, HAUTEUR_VUE / 2);
    expect(centre[1]).toBeGreaterThan(150);
    expect(centre[0]).toBeLessThan(100);
    await expect(assemblerVues([])).rejects.toThrow(/Aucune vue/);
  });

  it("règles partagées : nombre de vues, angles, détection d'une planche d'images", () => {
    expect(NB_VUES).toBe(4);
    expect(nombreDeVues(4800, 900)).toBe(4);
    expect(nombreDeVues(1200, 900)).toBe(1);
    expect(nombreDeVues(0, 0)).toBe(1);
    expect([0, 1, 2, 3, 4, -1].map((i) => angleDeLaVue(i))).toEqual([0, 90, 180, 270, 0, 270]);
    expect(estRenduImage("/api/files/rendus-3d/abc.jpg")).toBe(true);
    expect(estRenduImage("/api/files/plans-3d/abc.glb")).toBe(false);
    expect(estRenduImage("https://x/y.png?v=2")).toBe(true);
  });
});
