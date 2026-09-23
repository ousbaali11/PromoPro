import { expect, test } from "@playwright/test";
import { login, hrefBienStaff } from "./helpers";

/*
 * Dupliquer un bien : depuis la fiche d'un bien (Directeur Commercial), le
 * formulaire d'ajout du même projet est pré-rempli avec nature, prix et
 * surface, la désignation vidée et focalisée ; le bien créé reprend ces
 * valeurs. Le bouton n'existe pas pour les autres rôles.
 */
test("Dupliquer pré-remplit nature / prix / surface, vide la désignation, et le nouveau lot reprend ces valeurs", async ({ page }) => {
  await login(page, "DIRCOM");
  const href = await hrefBienStaff(page, "Appartement A02");
  await page.goto(href);
  await page.getByTestId("dupliquer-bien").click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/?]+\?dupliquer=[0-9a-f-]+/);

  const form = page.getByTestId("form-ajout-bien");
  await expect(form).toHaveAttribute("data-duplication", "true");
  await expect(page.getByTestId("duplication-bien")).toContainText("Copie de Appartement A02");
  await expect(form.getByLabel("Désignation")).toHaveValue("");
  await expect(form.getByLabel("Désignation")).toBeFocused();
  await expect(form.getByLabel("Nature")).toHaveValue("Appartement");
  await expect(form.getByLabel(/Prix/)).toHaveValue("920000");
  await expect(form.getByLabel(/Surface/)).toHaveValue("74");

  const designation = `Duplicata E2E ${Date.now().toString(36).toUpperCase()}`;
  await form.getByLabel("Désignation").fill(designation);
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  const lien = page.getByRole("link", { name: designation, exact: true });
  await expect(lien).toBeVisible();
  await lien.click();
  await expect(page.getByRole("heading", { name: designation })).toBeVisible();
  await expect(page.getByText("920 000 MAD").first()).toBeVisible();
  await expect(page.getByText(/74 m²/).first()).toBeVisible();
  await expect(page.getByText("Disponible", { exact: true })).toBeVisible();
});

test("le bouton Dupliquer est réservé au Directeur Commercial et un identifiant étranger est ignoré", async ({ page }) => {
  await login(page, "PDG");
  const href = await hrefBienStaff(page, "Appartement A02");
  await page.goto(href);
  await expect(page.getByTestId("dupliquer-bien")).toHaveCount(0);

  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[0-9a-f-]{36}$/);
  await page.goto(`${page.url()}?dupliquer=00000000-0000-4000-8000-000000000000`);
  await expect(page.getByTestId("form-ajout-bien")).not.toHaveAttribute("data-duplication", "true");
  await expect(page.getByTestId("duplication-bien")).toHaveCount(0);
});
