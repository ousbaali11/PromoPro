import { expect, test } from "@playwright/test";
import { COMPTES, login } from "./helpers";

test.describe("Connexion par rôle", () => {
  for (const cle of Object.keys(COMPTES) as (keyof typeof COMPTES)[]) {
    test(`${COMPTES[cle].identifiant} se connecte et atterrit sur la bonne page`, async ({ page }) => {
      await login(page, cle);
    });
  }

  test("un mauvais mot de passe est refusé sans révéler si le compte existe", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Identifiant").fill("PDG-DEMO");
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Identifiant").fill("COMPTE-INEXISTANT");
    await page.getByLabel("Mot de passe").fill("peu-importe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
  });
});
