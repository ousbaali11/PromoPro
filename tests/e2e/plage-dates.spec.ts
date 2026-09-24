import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/*
 * Sélecteur de plage de dates des tableaux de bord internes : résumé de la
 * plage active, trois onglets (Rapide, Relatif, Personnalisé), choix porté
 * par l'URL, dernier choix rappelé d'une session à l'autre (localStorage),
 * absent de l'espace client.
 */

test("PDG : préréglage en un clic, plage relative, plage personnalisée (fin après le début), rappel du dernier choix", async ({ page }) => {
  await login(page, "PDG");
  await page.goto("/dashboard");
  const selecteur = page.getByTestId("selecteur-plage");
  await expect(selecteur.getByTestId("selecteur-plage-libelle")).toHaveText("30 derniers jours");

  // Rapide : un clic applique et ferme
  await selecteur.getByTestId("selecteur-plage-bouton").click();
  await selecteur.getByTestId("plage-rapide-annee").click();
  await expect(page).toHaveURL(/plage=annee/);
  await expect(selecteur.getByTestId("selecteur-plage-libelle")).toHaveText("Cette année");
  await expect(selecteur.getByTestId("selecteur-plage-panneau")).toHaveCount(0);

  // Relatif : nombre + unité + sens, aperçu puis Appliquer
  await selecteur.getByTestId("selecteur-plage-bouton").click();
  await selecteur.getByRole("tab", { name: "Relatif" }).click();
  await selecteur.getByLabel("Nombre").fill("2");
  await selecteur.getByLabel("Unité").selectOption("semaines");
  await expect(selecteur.getByTestId("plage-relative-apercu")).toHaveText("2 dernières semaines");
  await selecteur.getByTestId("plage-appliquer").click();
  await expect(page).toHaveURL(/plage=rel%3A-2%3Asemaines/);
  await expect(selecteur.getByTestId("selecteur-plage-libelle")).toHaveText("2 dernières semaines");

  // Personnalisé : fin avant le début refusée, puis plage valide
  await selecteur.getByTestId("selecteur-plage-bouton").click();
  await selecteur.getByRole("tab", { name: "Personnalisé" }).click();
  await selecteur.getByLabel("Début").fill("2026-09-12T00:00");
  await selecteur.getByLabel("Fin").fill("2026-09-10T23:59");
  await selecteur.getByTestId("plage-appliquer").click();
  await expect(selecteur.getByTestId("plage-erreur")).toHaveText("La fin doit être postérieure au début.");
  await expect(page).toHaveURL(/plage=rel%3A-2%3Asemaines/); // rien n'a été appliqué
  await selecteur.getByLabel("Fin").fill("2026-09-24T23:59");
  await selecteur.getByTestId("plage-appliquer").click();
  await expect(page).toHaveURL(/plage=perso%3A/);
  await expect(selecteur.getByTestId("selecteur-plage-libelle")).toHaveText("12 sept. – 24 sept. 2026");

  // Rappel du dernier choix sans paramètre dans l'URL
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/plage=perso%3A/);
  await expect(page.getByTestId("selecteur-plage-libelle")).toHaveText("12 sept. – 24 sept. 2026");

  // Échap ferme le panneau sans rien changer
  await selecteur.getByTestId("selecteur-plage-bouton").click();
  await expect(selecteur.getByTestId("selecteur-plage-panneau")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(selecteur.getByTestId("selecteur-plage-panneau")).toHaveCount(0);
});

test("le sélecteur est présent pour un commercial et un comptable, absent de l'espace client", async ({ page }) => {
  for (const compte of ["COM1", "COMPTA"] as const) {
    await login(page, compte);
    await page.goto("/dashboard");
    await expect(page.getByTestId("selecteur-plage")).toBeVisible();
  }
  await login(page, "CLIENT");
  await page.goto("/client");
  await page.waitForURL(/\/client\/biens\/[^/]+$/); // un seul bien : redirection vers sa page
  await expect(page.getByRole("heading", { name: "Appartement A01" })).toBeVisible();
  await expect(page.getByTestId("selecteur-plage")).toHaveCount(0);
  await page.getByRole("link", { name: "Rendez-vous" }).click();
  await expect(page).toHaveURL(/\/client\/rendez-vous$/);
  await expect(page.getByTestId("selecteur-plage")).toHaveCount(0);
});
