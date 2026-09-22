import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Contrôle d'accès", () => {
  test("le PDG est redirigé hors de la page Équipe", async ({ page }) => {
    await login(page, "PDG");
    await page.goto("/dashboard/equipe");
    await expect(page).toHaveURL(/\/dashboard\?erreur=acces-refuse$/);
    await expect(page.locator('select[name="role"]')).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: "Équipe" })).toHaveCount(0);
  });

  test("un Commercial est redirigé hors de /admin", async ({ page }) => {
    await login(page, "COM1");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin/nouveau");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("un client est redirigé hors de /dashboard", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard/paiements");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sans session, les trois espaces renvoient vers /login", async ({ page }) => {
    await page.context().clearCookies();
    for (const url of ["/dashboard", "/admin", "/client"]) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/login$/);
    }
  });
});
