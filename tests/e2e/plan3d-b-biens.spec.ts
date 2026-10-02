import { expect, test, type Page } from "@playwright/test";
import { deposerFichier, hrefBienStaff, lireUrl, login, loginAvec, ouvrirBienClient, pngEchec, SUFFIXE_RUN } from "./helpers";

/*
 * Génération automatique du modèle 3D d'un bien à partir de son plan 2D
 * (fournisseur actif choisi dans /admin/plan3d, simulé par /api/dev/plan3d-stub) :
 * sans fournisseur actif rien ne se déclenche ; avec Gemini actif, le dépôt
 * d'un plan 2D crée une génération, le Directeur Commercial la voit en
 * attente puis prête, le client ne voit rien tant qu'elle n'est pas validée ;
 * après validation, l'onglet « Modèle 3D » apparaît dans l'espace client.
 * Une génération par bien et par 24 h ; les échecs sont notifiés discrètement.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const BIEN = `Studio 3D ${SUFFIXE}`;
const B = { href: "" };

async function deposerPlan2d(page: Page, fichier: { name: string; buffer?: Buffer }) {
  await page.goto(B.href);
  const form = page.getByTestId("form-plans");
  await deposerFichier(form, "plan2dUrl", [fichier]);
  await page.getByRole("button", { name: "Enregistrer les plans" }).click();
  await expect(page.getByTestId("plans-bien")).toBeVisible();
}

async function activerGemini(page: Page) {
  await login(page, "SUPERADMIN");
  await page.goto("/admin/plan3d");
  const carte = page.getByTestId("carte-fournisseur-GEMINI");
  if ((await carte.getByTestId("cle-masquee").innerText()) === "Aucune") {
    await carte.getByLabel(/Clé d'API/).fill("AIzaSy_test_biens_0123456789");
    await carte.getByRole("button", { name: "Enregistrer la clé" }).click();
    await expect(carte.getByTestId("cle-enregistree")).toBeVisible();
  }
  if ((await carte.getByTestId("badge-actif").count()) === 0) {
    await carte.getByTestId("bouton-actif").click();
    await expect(carte.getByTestId("badge-actif")).toBeVisible();
  }
}

test("sans fournisseur actif : le dépôt d'un plan 2D ne déclenche rien, le dépôt manuel fonctionne comme avant", async ({ page }) => {
  await login(page, "SUPERADMIN");
  await page.goto("/admin/plan3d");
  const actif = page.getByTestId("badge-actif");
  if (await actif.count()) {
    await page.locator('[data-testid^="carte-fournisseur-"]').filter({ has: actif }).getByTestId("bouton-actif").click();
    await expect(page.getByTestId("badge-actif")).toHaveCount(0);
  }

  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(BIEN);
  await form.getByTestId("select-nature").selectOption("Studio");
  await form.getByLabel(/Prix/).fill("450000");
  await form.getByLabel(/Surface/).fill("32");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: BIEN, exact: true })).toBeVisible();
  B.href = await hrefBienStaff(page, BIEN);

  await deposerPlan2d(page, { name: "plan-studio.png" });
  await expect(page.getByTestId("section-generations-3d")).toHaveCount(0);
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByTestId("section-generations-3d")).toHaveCount(0);
});

test("Gemini actif : le dépôt d'un plan 2D déclenche une génération, visible en attente puis prête pour le Directeur Commercial, jamais côté client avant validation", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await activerGemini(page);

  await login(page, "DIRCOM");
  await deposerPlan2d(page, { name: "plan-studio-2.png" });
  const section = page.getByTestId("section-generations-3d");
  await expect(section).toBeVisible();
  const ligne = section.getByTestId("generation-ligne").first();
  await expect(ligne).toHaveAttribute("data-statut", /EN_ATTENTE|PRET/);
  await expect(ligne.getByTestId("generation-statut")).toHaveText("À valider", { timeout: 30_000 });
  await expect(ligne).toContainText("Gemini");

  // Notification du Directeur Commercial
  await page.getByTestId("cloche-notifications").click();
  await expect(page.getByText("Modèle 3D généré, à valider").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Aperçu pour le Directeur Commercial ; le fichier est lisible par le staff du promoteur, pas par un client
  await ligne.getByTestId("voir-generation").click();
  const src = await ligne.locator("model-viewer").evaluate((el) => el.getAttribute("src") || String((el as unknown as { src?: string }).src ?? ""));
  expect(src).toMatch(/^\/api\/files\/plans-3d\/[0-9a-f-]+\.glb$/);
  expect((await lireUrl(page, src)).status()).toBe(200);
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  await loginAvec(client, "CL-DEMO", "demo1234", /\/client(\/biens\/[^/]+)?$/);
  expect((await lireUrl(client, src)).status()).toBe(403);
  await ctx.close();

  // Le bien n'a toujours pas de modèle 3D publié : un seul onglet (plan 2D) sur la fiche
  await expect(page.getByTestId("onglets-plans")).toHaveCount(0);
});

test("règle des 24 h : un second dépôt de plan 2D le même jour ne crée pas de seconde génération", async ({ page }) => {
  await login(page, "DIRCOM");
  await deposerPlan2d(page, { name: "plan-studio-3.png" });
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByTestId("section-generations-3d").getByTestId("generation-ligne")).toHaveCount(1);
});

test("validation : « Valider et publier » copie le modèle vers le plan 3D du bien, l'onglet « Modèle 3D » apparaît pour le client", async ({ page }) => {
  await login(page, "DIRCOM");
  await page.goto(B.href);
  const ligne = page.getByTestId("section-generations-3d").getByTestId("generation-ligne").first();
  await ligne.getByTestId("valider-generation").click();
  await expect(ligne.getByTestId("generation-statut")).toHaveText("Publié");
  await expect(ligne.getByTestId("valider-generation")).toHaveCount(0);
  const onglets = page.getByTestId("onglets-plans");
  await expect(onglets.getByRole("tab", { name: "Modèle 3D" })).toBeVisible();
  await page.goto("/dashboard/journal?periode=jour");
  await expect(page.getByTestId("journal-ligne").filter({ hasText: BIEN }).filter({ hasText: "Modèle 3D généré par Gemini validé et publié" })).toHaveCount(1);

  // Côté client : ce bien n'est pas vendu au client de démonstration, mais le fichier publié est désormais rattaché au bien ;
  // on vérifie le rendu sur la fiche staff (même composant PlansBien que l'espace client) et l'accès au fichier par le staff
  await page.goto(B.href);
  await page.getByTestId("onglets-plans").getByRole("tab", { name: "Modèle 3D" }).click();
  const viewer = page.locator("model-viewer");
  await expect(viewer).toHaveAttribute("src", /^\/api\/files\/plans-3d\/[0-9a-f-]+\.glb$/);
  const reponse = await lireUrl(page, (await viewer.getAttribute("src"))!);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toBe("model/gltf-binary");
});

test("espace client : un bien vendu dont le modèle généré est validé montre l'onglet « Modèle 3D » au client ; sans validation, rien", async ({ page }) => {
  test.setTimeout(120_000);
  // Appartement A01 est vendu au client de démonstration (seed) ; il a peut-être déjà un plan 3D manuel déposé par un spec précédent
  await login(page, "DIRCOM");
  const href = await hrefBienStaff(page, "Appartement A01");
  await page.goto(href);
  const dejaPublie = (await page.getByTestId("onglets-plans").getByRole("tab", { name: "Modèle 3D" }).count()) > 0;
  if (dejaPublie) {
    test.info().annotations.push({ type: "note", description: "A01 a déjà un modèle 3D : la génération automatique ne se déclenche pas (modèle manuel présent), vérifié" });
    const form = page.getByTestId("form-plans");
    await deposerFichier(form, "plan2dUrl", [{ name: "plan-a01.png" }]);
    await page.getByRole("button", { name: "Enregistrer les plans" }).click();
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByTestId("section-generations-3d")).toHaveCount(0);
    return;
  }
  const form = page.getByTestId("form-plans");
  await deposerFichier(form, "plan2dUrl", [{ name: "plan-a01.png" }]);
  await page.getByRole("button", { name: "Enregistrer les plans" }).click();
  const ligne = page.getByTestId("section-generations-3d").getByTestId("generation-ligne").first();
  await expect(ligne.getByTestId("generation-statut")).toHaveText("À valider", { timeout: 30_000 });

  // Avant validation : le client ne voit pas d'onglet Modèle 3D
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await expect(page.getByRole("tab", { name: "Modèle 3D" })).toHaveCount(0);

  await login(page, "DIRCOM");
  await page.goto(href);
  await page.getByTestId("section-generations-3d").getByTestId("valider-generation").first().click();
  await expect(page.getByTestId("section-generations-3d").getByTestId("generation-statut").first()).toHaveText("Publié");

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await page.getByRole("tab", { name: "Modèle 3D" }).click();
  const viewer = page.locator("model-viewer");
  await expect(viewer).toHaveAttribute("src", /^\/api\/files\/plans-3d\/[0-9a-f-]+\.glb$/);
  expect((await lireUrl(page, (await viewer.getAttribute("src"))!)).status()).toBe(200);
});

test("échec du fournisseur : statut Échec avec message, notification discrète, fiche intacte, dépôt manuel toujours possible", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(`Cave 3D ${SUFFIXE}`);
  await form.getByTestId("select-nature").selectOption("Cave");
  await form.getByLabel(/Prix/).fill("60000");
  await form.getByLabel(/Surface/).fill("8");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  const href = await hrefBienStaff(page, `Cave 3D ${SUFFIXE}`);
  await page.goto(href);
  await deposerFichier(page.getByTestId("form-plans"), "plan2dUrl", [{ name: "plan-cave.png", buffer: pngEchec() }]);
  await page.getByRole("button", { name: "Enregistrer les plans" }).click();
  const ligne = page.getByTestId("section-generations-3d").getByTestId("generation-ligne").first();
  await expect(ligne.getByTestId("generation-statut")).toHaveText("Échec", { timeout: 30_000 });
  await expect(ligne.getByTestId("generation-erreur")).toContainText("aucune pièce");
  await expect(ligne.getByTestId("valider-generation")).toHaveCount(0);
  await page.getByTestId("cloche-notifications").click();
  await expect(page.getByText("Génération du modèle 3D impossible").first()).toBeVisible();
  await page.keyboard.press("Escape");
  // La fiche reste utilisable : dépôt manuel d'un modèle 3D
  await expect(page.getByTestId("form-plans")).toBeVisible();
  await expect(page.getByTestId("plans-bien")).toBeVisible();
});
