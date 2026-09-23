import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { login, hrefBienStaff, deposerFichier } from "./helpers";

/*
 * Rendu 3D d'un bien : le Directeur Commercial dépose un vrai fichier .glb
 * (tests/fixtures/cube.glb, cube texturé généré par scripts/generer-cube-glb.mjs),
 * l'onglet « Modèle 3D » apparaît et <model-viewer> charge effectivement le
 * modèle (propriété `loaded`, dimensions du cube), pas seulement l'onglet.
 * Le composant web est chargé depuis le CDN Google : le test a besoin du réseau.
 */
const CUBE = readFileSync(join(__dirname, "..", "fixtures", "cube.glb"));

test("plan 3D : dépôt d'un .glb, onglet « Modèle 3D », modèle chargé par <model-viewer>", async ({ page }) => {
  expect(CUBE.subarray(0, 4).toString("ascii")).toBe("glTF");

  await login(page, "DIRCOM");
  const href = await hrefBienStaff(page, "Parking P01");
  await page.goto(href);
  const form = page.getByTestId("form-plans");
  await deposerFichier(form, "plan2dUrl", [{ name: "plan-p01.png" }]);
  await deposerFichier(form, "plan3dUrl", [{ name: "cube.glb", buffer: CUBE }]);
  await page.getByRole("button", { name: "Enregistrer les plans" }).click();

  // Les deux onglets sont là ; le modèle 3D s'ouvre
  const onglets = page.getByTestId("onglets-plans");
  await expect(onglets.getByRole("tab", { name: "Plan 2D" })).toBeVisible();
  await onglets.getByRole("tab", { name: "Modèle 3D" }).click();
  const viewer = page.locator("model-viewer");
  await expect(viewer).toHaveAttribute("src", /\/api\/files\/plans-3d\/[0-9a-f-]+\.glb$/);

  // Le fichier est servi avec son type MIME, sans réinterprétation possible par le navigateur
  const src = (await viewer.getAttribute("src"))!;
  const reponse = await page.request.get(src);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toBe("model/gltf-binary");
  expect(reponse.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await reponse.body()).equals(CUBE)).toBe(true);

  // <model-viewer> a chargé le modèle : `loaded` passe à vrai et les dimensions sont celles du cube (1 × 1 × 1)
  await page.waitForFunction(
    () => {
      const mv = document.querySelector("model-viewer") as (HTMLElement & { loaded?: boolean }) | null;
      return !!mv && mv.loaded === true;
    },
    null,
    { timeout: 60_000 },
  );
  const dimensions = await viewer.evaluate((el) => (el as HTMLElement & { getDimensions: () => { x: number; y: number; z: number } }).getDimensions());
  expect(dimensions.x).toBeCloseTo(1, 2);
  expect(dimensions.y).toBeCloseTo(1, 2);
  expect(dimensions.z).toBeCloseTo(1, 2);

  // Retour à l'onglet 2D : l'aperçu image est bien celui déposé
  await onglets.getByRole("tab", { name: "Plan 2D" }).click();
  await expect(page.locator('img[alt="Plan du bien"]')).toHaveAttribute("src", /\/api\/files\/plans\/[0-9a-f-]+\.png$/);
});
