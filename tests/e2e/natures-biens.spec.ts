import { expect, test } from "@playwright/test";
import { login, SUFFIXE_RUN } from "./helpers";

/*
 * Natures de biens : liste exhaustive par groupe (résidentiel, terrain,
 * professionnel, stationnement et annexes, immeuble) à la création et à la
 * modification d'un bien ; une valeur hors liste est refusée côté serveur.
 */
const SUFFIXE = SUFFIXE_RUN;
const DESIGNATION = `Garage G${SUFFIXE}`;

test("création avec une nouvelle nature (Garage), affichage, filtre, modification vers Terrain constructible, nature forgée refusée", async ({ page }) => {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  const select = form.getByTestId("select-nature");
  await expect(select).toBeVisible();
  // La liste propose bien plus que les quatre natures historiques, groupées
  await expect.poll(() => select.locator("option").count()).toBeGreaterThanOrEqual(30);
  await expect.poll(() => select.locator("optgroup").count()).toBeGreaterThanOrEqual(5);
  await form.getByLabel("Désignation").fill(DESIGNATION);
  await select.selectOption("Garage");
  await form.getByLabel(/Prix/).fill("120000");
  await form.getByLabel(/Surface/).fill("18");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  const lien = page.getByRole("link", { name: DESIGNATION, exact: true });
  await expect(lien).toBeVisible();
  // Le filtre par nature de la liste connaît la nouvelle valeur
  await expect(page.getByTestId("filtre-nature").locator("option", { hasText: "Garage" })).toHaveCount(1);

  // Modification : Terrain constructible
  const href = (await lien.getAttribute("href"))!;
  await page.goto(`${href}/modifier`);
  await expect(page.getByTestId("form-modifier-bien")).toBeVisible();
  await page.getByTestId("select-nature").selectOption("Terrain constructible");
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/biens\/[^/]+$/);
  await expect(page.getByText("Terrain constructible").first()).toBeVisible();

  // Nature forgée (hors liste) : refusée par la Server Action, la nature reste inchangée
  await page.goto(`${href}/modifier`);
  await page.getByTestId("select-nature").evaluate((el) => {
    const o = document.createElement("option");
    o.value = "Château";
    o.textContent = "Château";
    (el as HTMLSelectElement).appendChild(o);
    (el as HTMLSelectElement).value = "Château";
  });
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page.getByText("La nature du bien n'est pas reconnue : choisissez-la dans la liste.")).toBeVisible();
  await page.goto(href);
  await expect(page.getByText("Terrain constructible").first()).toBeVisible();
  await expect(page.getByText("Château")).toHaveCount(0);
});
