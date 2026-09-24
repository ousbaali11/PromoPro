import { expect, test } from "@playwright/test";
import { deposerFichier, login, ouvrirBienClient } from "./helpers";
import { texteDuPdf } from "../pdf-texte";

/*
 * Chaque promoteur voit SON nom, jamais celui de la plateforme, partout où le
 * client final regarde : en-tête et titre de l'espace client, contrats, reçus
 * et autorisations de visite. Le promoteur de démonstration s'appelle
 * « Résidences Atlas » précisément pour que « PromoPro » ne puisse y
 * apparaître que par erreur. Le logo est optionnel : déposé par le Super
 * Admin, il est servi aux clients du promoteur et repris en en-tête.
 */
const PROMOTEUR = "Résidences Atlas";

test("espace client : en-tête et titre au nom du promoteur, aucun « PromoPro » ; contrat, reçu et autorisation au nom du promoteur", async ({ page }) => {
  await login(page, "CLIENT");
  await page.goto("/client");
  await page.waitForURL(/\/client\/biens\/[^/]+$/);
  await expect(page.getByTestId("entete-promoteur")).toHaveText(PROMOTEUR);
  expect(await page.title()).toContain(PROMOTEUR);
  await expect(page.locator("body")).not.toContainText("PromoPro");
  await ouvrirBienClient(page, "Appartement A01");
  await expect(page.locator("body")).not.toContainText("PromoPro");

  // Tous les PDF proposés au client sur ce bien (reçus validés, contrat, autorisation de visite)
  const liens = page.getByRole("link", { name: /Reçu PDF|Contrat de vente|Autorisation de visite|Autorisation$/ });
  const hrefs = [...new Set((await liens.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")))).filter((h): h is string => !!h))];
  expect(hrefs.length, "au moins un reçu et une autorisation (générés par client.spec)").toBeGreaterThanOrEqual(2);
  for (const href of hrefs) {
    const reponse = await page.request.get(href);
    expect(reponse.status(), href).toBe(200);
    expect(reponse.headers()["content-type"], href).toContain("application/pdf");
    const texte = await texteDuPdf(await reponse.body());
    expect(texte, href).toContain(PROMOTEUR);
    expect(texte, href).not.toMatch(/PromoPro/i);
  }
});

test("logo du promoteur : déposé par le Super Admin, visible dans la liste et dans l'en-tête de l'espace client", async ({ page }) => {
  await login(page, "SUPERADMIN");
  await page.goto("/admin");
  const ligne = page.getByTestId("promoteur-ligne").filter({ hasText: PROMOTEUR });
  await ligne.getByTestId("bouton-logo-promoteur").click();
  const form = page.getByTestId("form-logo-promoteur");
  await deposerFichier(form, "logoUrl", [{ name: "logo-atlas.png" }]);
  await form.getByRole("button", { name: "Enregistrer" }).click();
  const vignette = ligne.getByTestId("logo-promoteur-image");
  await expect(vignette).toBeVisible();
  const src = await vignette.getAttribute("src");
  expect(src).toMatch(/^\/api\/files\/logos\/[0-9a-f-]{36}\.png$/);

  // Le client du promoteur voit le logo (fichier servi à tout compte du promoteur, sans être rattaché à son dossier)
  await login(page, "CLIENT");
  await page.goto("/client");
  const logoClient = page.getByTestId("logo-promoteur-client");
  await expect(logoClient).toBeVisible();
  expect(await logoClient.getAttribute("src")).toBe(src);
  const image = await page.request.get(src!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  await expect(page.getByTestId("entete-promoteur")).toHaveText(PROMOTEUR);
});
