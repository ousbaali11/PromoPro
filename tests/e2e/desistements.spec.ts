import { expect, test } from "@playwright/test";
import { deposerFichier, hrefBienStaff, login } from "./helpers";

/**
 * Module Désistements (sections 6.5 et 7.1) sur l'Appartement A02 du seed :
 * le PDG accepte la proposition en attente → le commercial enregistre le
 * désistement légalisé (bien remis à zéro, tracé dans « Biens désistés ») →
 * le Responsable Administratif vérifie puis marque remboursé → le client ne
 * voit plus le bien.
 */
test.describe.configure({ mode: "serial" });

let hrefA02 = "";

test("préambule : le PDG accepte la proposition sur A02", async ({ page }) => {
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: "Appartement A02" });
  await expect(carte).toHaveCount(1);
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();
});

test("le commercial enregistre le désistement : bien remis à zéro et tracé dans Biens désistés", async ({ page }) => {
  await login(page, "COM2");
  hrefA02 = await hrefBienStaff(page, "Appartement A02");
  await page.goto(hrefA02);
  await expect(page.getByText("Vendu", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-legalise.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();

  await expect(page).toHaveURL(/\/dashboard\/desistes$/);
  const ligne = page.locator("table tbody tr", { hasText: "Appartement A02" });
  await expect(ligne).toHaveCount(1);
  await expect(ligne.getByText("À vérifier")).toBeVisible();
  await expect(ligne.getByText("Disponible")).toBeVisible();
  await expect(ligne.getByText("Hamid Naciri")).toBeVisible();

  // Le bien est de nouveau commercialisable, sans client
  await page.goto(hrefA02);
  await expect(page.getByText("Disponible", { exact: true })).toBeVisible();
  await expect(page.getByText("Hamid Naciri")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Envoyer une proposition" })).toBeVisible();
});

test("le Responsable Administratif vérifie les papiers puis marque le remboursement", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  const carte = page.locator("[data-card]", { hasText: "Appartement A02" });
  await expect(carte).toHaveCount(1);
  await expect(carte.getByText("À vérifier")).toBeVisible();
  await expect(carte.getByRole("link", { name: "Document de désistement légalisé" })).toBeVisible();
  await expect(carte.getByText(/À rembourser/)).toBeVisible();

  // L'index ne porte aucune action : le dossier se traite sur la fiche du client (onglet Contrat), avec le bien désisté sélectionné
  await expect(carte.getByRole("button", { name: "Papiers vérifiés" })).toHaveCount(0);
  await carte.getByTestId("lien-fiche-client").click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+\?bien=[^&]+&onglet=contrat$/);
  await expect(page.getByTestId("bien-selectionne")).toHaveText("Appartement A02");
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await expect(dossier.getByText("Vérifié — remboursement en cours")).toBeVisible();

  await dossier.getByLabel("Décharge").fill("Payeur identique au client, pas de décharge nécessaire");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();

  await page.goto("/dashboard/desistements");
  await expect(page.getByText("Aucun désistement en attente")).toBeVisible();
  const historique = page.locator("section", { hasText: "Historique" }).locator("[data-card]", { hasText: "Appartement A02" });
  await expect(historique.getByText("Remboursé", { exact: true })).toBeVisible();
  await expect(historique.getByText(/Décharge : Payeur identique/)).toBeVisible();

  // Le Directeur Financier a été prévenu pour organiser le remboursement
  await login(page, "DIRFIN");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Remboursement à organiser").first()).toBeVisible();
});

test("le client ne voit plus le bien désisté", async ({ page }) => {
  await login(page, "CLIENT");
  await page.goto("/client");
  await expect(page.getByRole("link", { name: /Appartement A02/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Appartement A02" })).toHaveCount(0);
});
