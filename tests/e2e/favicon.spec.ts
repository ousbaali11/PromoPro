import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { deposerFichier, login } from "./helpers";

/*
 * Icône de favori (favicon) :
 * - pages publiques et administration : icône PromoPro (icon.svg au visuel de
 *   la marque, favicon.ico pour les navigateurs anciens, apple-icon pour iOS) ;
 * - espaces connectés (tableau de bord interne, espace client) : icône
 *   générée par promoteur — son logo s'il en a déposé un, sinon l'icône
 *   PromoPro ; sans session, toujours l'icône par défaut (jamais un logo).
 * L'icône d'onglet elle-même n'est pas observable par Playwright : on vérifie
 * les <link rel="icon"> de chaque page et ce que répond chaque adresse.
 */
test.describe.configure({ mode: "serial" });

const PROMOTEUR = "Résidences Atlas";
const TRACE_BUILDING2 = "M6 21V5a2 2 0 0 1 2-2h8";

type Lien = { rel: string; href: string; type: string; sizes: string };

async function liensIcones(page: Page): Promise<Lien[]> {
  return page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((els) =>
    els.map((el) => ({
      rel: el.getAttribute("rel") ?? "",
      href: el.getAttribute("href") ?? "",
      type: el.getAttribute("type") ?? "",
      sizes: el.getAttribute("sizes") ?? "",
    })),
  );
}

/** Largeur d'un PNG (champ IHDR). */
function largeurPng(corps: Buffer) {
  expect(corps.subarray(1, 4).toString("ascii")).toBe("PNG");
  return corps.readUInt32BE(16);
}

async function attendrePng(reponse: APIResponse, largeur: number, origine: "par-defaut" | "promoteur") {
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toBe("image/png");
  expect(reponse.headers()["cache-control"]).toContain("private");
  expect(reponse.headers()["x-icone-origine"]).toBe(origine);
  const corps = await reponse.body();
  expect(largeurPng(corps)).toBe(largeur);
  return corps;
}

/** Lien d'icône d'onglet d'un espace connecté : une seule icône dynamique, plus d'icon.svg. */
async function lienIconeDynamique(page: Page, prefixe: "/dashboard/icon" | "/client/icon") {
  const liens = await liensIcones(page);
  const dynamiques = liens.filter((l) => l.rel === "icon" && l.href.startsWith(prefixe));
  expect(dynamiques, `un lien ${prefixe} dans ${JSON.stringify(liens)}`).toHaveLength(1);
  expect(liens.some((l) => l.href.startsWith("/icon.svg")), "icon.svg ne doit plus être proposé dans un espace connecté").toBe(false);
  expect(dynamiques[0].sizes).toBe("64x64");
  return dynamiques[0].href;
}

async function ouvrirFormulaireLogo(page: Page) {
  await login(page, "SUPERADMIN");
  await page.goto("/admin");
  const ligne = page.getByTestId("promoteur-ligne").filter({ hasText: PROMOTEUR });
  await ligne.getByTestId("bouton-logo-promoteur").click();
  const form = page.getByTestId("form-logo-promoteur");
  await expect(form).toBeVisible();
  return { ligne, form };
}

async function retirerLogo(page: Page) {
  const { ligne, form } = await ouvrirFormulaireLogo(page);
  const retirer = form.getByRole("button", { name: "Retirer le fichier" });
  if (await retirer.count()) await retirer.click();
  await form.getByRole("button", { name: "Enregistrer" }).click();
  await expect(form).toBeHidden();
  await expect(ligne.getByTestId("logo-promoteur-image")).toHaveCount(0);
}

async function deposerLogo(page: Page) {
  const { ligne, form } = await ouvrirFormulaireLogo(page);
  await deposerFichier(form, "logoUrl", [{ name: "logo-favicon.png" }]);
  await form.getByRole("button", { name: "Enregistrer" }).click();
  await expect(form).toBeHidden();
  await expect(ligne.getByTestId("logo-promoteur-image")).toBeVisible();
}

test("pages publiques et administration : icône PromoPro (SVG de la marque), favicon.ico et icône iOS", async ({ page }) => {
  await page.goto("/login");
  const liens = await liensIcones(page);
  const svg = liens.find((l) => l.rel === "icon" && l.href.startsWith("/icon.svg"));
  const ico = liens.find((l) => l.rel === "icon" && l.href.startsWith("/favicon.ico"));
  const apple = liens.find((l) => l.rel === "apple-touch-icon" && l.href.startsWith("/apple-icon"));
  expect(svg, JSON.stringify(liens)).toBeTruthy();
  expect(ico, JSON.stringify(liens)).toBeTruthy();
  expect(apple, JSON.stringify(liens)).toBeTruthy();
  expect(svg!.type).toBe("image/svg+xml");
  expect(apple!.sizes).toBe("180x180");

  // Le SVG reprend la marque : carré doré, pictogramme Building2
  const reponseSvg = await page.request.get(svg!.href);
  expect(reponseSvg.status()).toBe(200);
  expect(reponseSvg.headers()["content-type"]).toContain("image/svg+xml");
  const texte = await reponseSvg.text();
  expect(texte).toContain("#b08d57");
  expect(texte).toContain(TRACE_BUILDING2);
  expect(texte).toContain('rx="11"');

  const reponseIco = await page.request.get(ico!.href);
  expect(reponseIco.status()).toBe(200);
  expect(reponseIco.headers()["content-type"]).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);
  const corpsIco = await reponseIco.body();
  expect(corpsIco.readUInt16LE(2)).toBe(1); // type ICO
  expect(corpsIco.readUInt16LE(4)).toBe(3); // 16, 32, 48 px

  const reponseApple = await page.request.get(apple!.href);
  expect(reponseApple.status()).toBe(200);
  expect(reponseApple.headers()["content-type"]).toBe("image/png");
  expect(largeurPng(await reponseApple.body())).toBe(180);

  // Administration (Super Admin, sans promoteur) : même icône PromoPro
  await login(page, "SUPERADMIN");
  await page.goto("/admin");
  const liensAdmin = await liensIcones(page);
  expect(liensAdmin.some((l) => l.href.startsWith("/icon.svg")), JSON.stringify(liensAdmin)).toBe(true);
  expect(liensAdmin.some((l) => l.href.startsWith("/dashboard/icon") || l.href.startsWith("/client/icon"))).toBe(false);
});

test("sans session : les icônes dynamiques répondent l'icône par défaut (jamais un logo, jamais une redirection)", async ({ request }) => {
  await attendrePng(await request.get("/dashboard/icon", { maxRedirects: 0 }), 64, "par-defaut");
  await attendrePng(await request.get("/client/icon", { maxRedirects: 0 }), 64, "par-defaut");
});

test("promoteur sans logo : tableau de bord et espace client reçoivent l'icône PromoPro générée en PNG", async ({ page }) => {
  await retirerLogo(page);

  await login(page, "PDG");
  await page.goto("/dashboard");
  const hrefStaff = await lienIconeDynamique(page, "/dashboard/icon");
  await attendrePng(await page.request.get(hrefStaff), 64, "par-defaut");

  await login(page, "CLIENT");
  await page.goto("/client");
  await page.waitForURL(/\/client\/biens\/[^/]+$/);
  const hrefClient = await lienIconeDynamique(page, "/client/icon");
  await attendrePng(await page.request.get(hrefClient), 64, "par-defaut");
});

test("promoteur avec logo : l'icône d'onglet est le logo (staff et client), puis retour à l'icône par défaut au retrait", async ({ page, request }) => {
  const parDefaut = await attendrePng(await request.get("/dashboard/icon"), 64, "par-defaut");

  await deposerLogo(page);

  await login(page, "PDG");
  await page.goto("/dashboard");
  const hrefStaff = await lienIconeDynamique(page, "/dashboard/icon");
  const iconeStaff = await attendrePng(await page.request.get(hrefStaff), 64, "promoteur");
  expect(iconeStaff.equals(parDefaut)).toBe(false);

  await login(page, "CLIENT");
  await page.goto("/client");
  await page.waitForURL(/\/client\/biens\/[^/]+$/);
  const hrefClient = await lienIconeDynamique(page, "/client/icon");
  const iconeClient = await attendrePng(await page.request.get(hrefClient), 64, "promoteur");
  expect(iconeClient.equals(iconeStaff)).toBe(true);

  // Retrait du logo : l'icône repasse au défaut sans attendre l'expiration du cache (l'URL du logo a changé)
  await retirerLogo(page);
  await login(page, "PDG");
  await page.goto("/dashboard");
  await attendrePng(await page.request.get(hrefStaff), 64, "par-defaut");
});
