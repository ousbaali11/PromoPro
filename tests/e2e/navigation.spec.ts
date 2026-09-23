import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/*
 * Navigation de secours (404, pages d'erreur) et fil d'Ariane des pages de
 * détail. Lecture seule.
 */

test.describe("Page introuvable et retour à l'accueil selon la session", () => {
  test("staff : la 404 ramène au tableau de bord, « Page précédente » revient en arrière", async ({ page }) => {
    await login(page, "PDG");
    await page.goto("/dashboard/projets");
    await page.goto("/dashboard/cette-page-n-existe-pas");
    await expect(page.getByTestId("page-introuvable")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();

    await page.getByRole("button", { name: "Page précédente" }).click();
    await expect(page).toHaveURL(/\/dashboard\/projets$/);

    await page.goto("/dashboard/cette-page-n-existe-pas");
    await page.getByRole("link", { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("client : la 404 ramène à l'espace client", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/inconnu");
    await page.getByRole("link", { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL(/\/client(\/biens\/[^/]+)?$/);
  });

  test("Super Admin : la 404 ramène à l'administration", async ({ page }) => {
    await login(page, "SUPERADMIN");
    await page.goto("/admin/inconnu");
    await page.getByRole("link", { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("sans session : la 404 ramène à la connexion, et un bien inconnu rend la 404 de l'espace", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/nulle-part");
    await page.getByRole("link", { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // notFound() levé dans une page de l'espace staff : la 404 s'affiche dans la coquille (sidebar présente)
    await login(page, "PDG");
    await page.goto("/dashboard/biens/00000000-0000-0000-0000-000000000000");
    await expect(page.getByTestId("page-introuvable")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
  });
});

test.describe("Fil d'Ariane des pages de détail", () => {
  test("bien : Projets > projet > bien, chaque segment cliquable", async ({ page }) => {
    await login(page, "PDG");
    await page.goto("/dashboard/projets");
    await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
    const filProjet = page.getByRole("navigation", { name: "Fil d'Ariane" });
    await expect(filProjet).toContainText("Projets");
    await expect(filProjet.locator("[aria-current='page']")).toHaveText("Résidence Al Manar");

    await page.getByRole("link", { name: "Appartement A01", exact: true }).click();
    const fil = page.getByRole("navigation", { name: "Fil d'Ariane" });
    await expect(fil.getByRole("link", { name: "Projets" })).toBeVisible();
    await expect(fil.getByRole("link", { name: "Résidence Al Manar" })).toBeVisible();
    await expect(fil.locator("[aria-current='page']")).toHaveText("Appartement A01");

    await fil.getByRole("link", { name: "Résidence Al Manar" }).click();
    await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);
    await page.goBack();
    await fil.getByRole("link", { name: "Projets" }).click();
    await expect(page).toHaveURL(/\/dashboard\/projets$/);
  });

  test("client (fiche staff) et espace client", async ({ page }) => {
    await login(page, "COM1");
    await page.goto("/dashboard/clients");
    await page.getByRole("link", { name: "Hamid Naciri" }).first().click();
    const fil = page.getByRole("navigation", { name: "Fil d'Ariane" });
    await expect(fil.getByRole("link", { name: "Clients" })).toBeVisible();
    await expect(fil.locator("[aria-current='page']")).toHaveText("Hamid Naciri");

    await login(page, "CLIENT");
    await expect(page.getByRole("heading", { name: "Appartement A01" })).toBeVisible();
    const filClient = page.getByRole("navigation", { name: "Fil d'Ariane" });
    await expect(filClient.getByRole("link", { name: "Mes biens" })).toBeVisible();
    await expect(filClient.locator("[aria-current='page']")).toHaveText("Appartement A01");
  });
});
