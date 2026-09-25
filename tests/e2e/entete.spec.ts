import { expect, test } from "@playwright/test";
import { login, ouvrirFicheClientDepuisListe } from "./helpers";

/*
 * En-tête de chaque espace : le nom (et le logo) du promoteur est un lien qui
 * ramène à l'accueil de l'espace de l'utilisateur connecté — /dashboard pour
 * les rôles internes, /admin pour le Super Admin, /client pour un client —
 * depuis n'importe quelle page profonde. La page de connexion n'affiche plus
 * aucun identifiant ni mot de passe de démonstration.
 */
const PROMOTEUR = "Résidences Atlas";

test("la page de connexion ne montre aucun compte de démonstration", async ({ page }) => {
  await page.goto("/login");
  const corps = page.locator("body");
  await expect(corps).not.toContainText("Comptes de démonstration");
  await expect(corps).not.toContainText("demo1234");
  await expect(corps).not.toContainText("PDG-DEMO");
  await expect(corps).not.toContainText("SUPERADMIN");
  await expect(page.locator("details")).toHaveCount(0);
});

test("rôles internes : le nom du promoteur dans l'en-tête ramène au tableau de bord depuis le journal et depuis une fiche client", async ({ page }) => {
  await login(page, "PDG");
  await page.goto("/dashboard/journal");
  await expect(page.getByTestId("filtres-journal")).toBeVisible(); // journal peut être vide sur une base fraîche
  const lien = page.getByTestId("lien-accueil");
  await expect(lien).toHaveAttribute("href", "/dashboard");
  await expect(lien.getByTestId("entete-promoteur")).toHaveText(PROMOTEUR);
  await expect(lien).toHaveCSS("cursor", "pointer");
  await lien.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bonjour");

  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  await ouvrirFicheClientDepuisListe(page, /Naciri/);
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
  await page.getByTestId("lien-accueil").click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Super Admin : la marque de l'en-tête ramène à /admin depuis la création d'un promoteur", async ({ page }) => {
  await login(page, "SUPERADMIN");
  await page.goto("/admin/nouveau");
  await expect(page.getByRole("heading", { name: "Nouveau promoteur" })).toBeVisible();
  const lien = page.getByTestId("lien-accueil");
  await expect(lien).toHaveAttribute("href", "/admin");
  await expect(lien).toHaveCSS("cursor", "pointer");
  await lien.click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("espace client : le nom du promoteur ramène à l'accueil depuis la page Contact", async ({ page }) => {
  await login(page, "CLIENT");
  await page.goto("/client/contact");
  await expect(page.getByRole("heading", { name: "Contacter un service" })).toBeVisible();
  const lien = page.getByTestId("lien-accueil");
  await expect(lien).toHaveAttribute("href", "/client");
  await expect(lien.getByTestId("entete-promoteur")).toHaveText(PROMOTEUR);
  await expect(lien).toHaveCSS("cursor", "pointer");
  await lien.click();
  // Un seul bien : /client redirige vers sa fiche, c'est bien l'accueil de cet espace
  await expect(page).toHaveURL(/\/client(\/biens\/[^/]+)?$/);
});
