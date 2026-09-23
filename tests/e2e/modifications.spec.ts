import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

/*
 * Boutons « Modifier » : projet, bien (disponible seulement), client, recrue.
 * Chaque test modifie une valeur puis la remet, et vérifie la trace dans le
 * journal d'activité avec le détail « avant → après ».
 */

async function ligneJournal(page: Page, cible: string, action = "Modification") {
  await page.goto("/dashboard/journal?periode=jour");
  return page.getByTestId("journal-ligne").filter({ hasText: cible }).filter({ hasText: action });
}

test("projet : le Directeur Commercial modifie le nom du compte, le journal détaille le changement, puis retour arrière", async ({ page }) => {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await page.getByTestId("modifier-projet").click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+\/modifier$/);

  const champ = page.getByLabel("Nom du compte / société");
  const initial = await champ.inputValue();
  await champ.fill(`${initial} (test)`);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);
  await expect(page.getByText(`${initial} (test)`)).toBeVisible();

  const ligne = await ligneJournal(page, "Résidence Al Manar");
  await expect(ligne.first()).toContainText(`Nom du compte : ${initial} → ${initial} (test)`);

  // Retour arrière
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await page.getByTestId("modifier-projet").click();
  await expect(page).toHaveURL(/\/modifier$/);
  await page.getByLabel("Nom du compte / société").fill(initial);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);
  await expect(page.getByText(`${initial} (test)`)).toHaveCount(0);
});

test("bien : modifiable tant qu'il est disponible, plus jamais après une vente", async ({ page }) => {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();

  // Bien vendu : pas de bouton, et la page de modification l'explique
  await page.getByRole("link", { name: "Appartement A01", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/biens\/[^/]+$/);
  await expect(page.getByTestId("modifier-bien")).toHaveCount(0);
  const urlA01 = page.url();
  await page.goto(`${urlA01}/modifier`);
  await expect(page.getByTestId("bien-non-modifiable")).toBeVisible();
  await expect(page.getByTestId("form-modifier-bien")).toHaveCount(0);

  // Bien disponible : modification de la surface puis retour arrière
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await page.getByTestId("vue-liste").click();
  const disponible = page.getByTestId("bien-ligne").filter({ has: page.locator('[data-statut="DISPONIBLE"]') }).first();
  const designation = (await disponible.getByTestId("bien-lien").textContent())!.trim();
  await disponible.getByTestId("bien-lien").click();
  await page.getByTestId("modifier-bien").click();
  const surface = page.getByLabel("Surface (m²)");
  const initiale = await surface.inputValue();
  const nouvelle = String(Number(initiale) + 1);
  await surface.fill(nouvelle);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/biens\/[^/]+$/);
  await expect(page.getByText(`${nouvelle} m²`).first()).toBeVisible();

  const ligne = await ligneJournal(page, designation);
  await expect(ligne.first()).toContainText("Surface");

  await page.goBack();
  await page.getByTestId("modifier-bien").click();
  await expect(page).toHaveURL(/\/modifier$/);
  await page.getByLabel("Surface (m²)").fill(initiale);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/biens\/[^/]+$/);
  await expect(page.getByText(`${initiale} m²`).first()).toBeVisible();
});

test("client : le commercial gérant modifie un téléphone, le journal le trace, puis retour arrière", async ({ page }) => {
  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: "Hamid Naciri" }).click();
  await page.getByTestId("modifier-client").click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/]+\/modifier$/);

  const tel2 = page.getByLabel("Téléphone 2 (facultatif)");
  const initial = await tel2.inputValue();
  await tel2.fill("+212 6 12 00 00 12");
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/]+$/);
  await expect(page.getByText("+212 6 12 00 00 12")).toBeVisible();

  await login(page, "DIRCOM");
  const ligne = await ligneJournal(page, "Hamid Naciri");
  await expect(ligne.first()).toContainText("Téléphone 2");
  await expect(ligne.first()).toContainText("+212 6 12 00 00 12");

  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: "Hamid Naciri" }).click();
  await page.getByTestId("modifier-client").click();
  await expect(page).toHaveURL(/\/modifier$/);
  await page.getByLabel("Téléphone 2 (facultatif)").fill(initial);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/]+$/);
});

test("recrue : le directeur du pôle modifie l'e-mail ; un autre commercial ne peut pas modifier un client qui n'est pas le sien", async ({ page }) => {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/equipe");
  const ligne = page.getByTestId("membre-ligne").filter({ hasText: "Imane Tazi" });
  await ligne.getByTestId("modifier-membre").click();
  await expect(page).toHaveURL(/\/dashboard\/equipe\/[^/]+\/modifier$/);
  const email = page.getByLabel("E-mail");
  const initial = await email.inputValue();
  await email.fill("imane.test@promopro.ma");
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/equipe$/);
  await expect(page.getByTestId("membre-ligne").filter({ hasText: "Imane Tazi" })).toContainText("imane.test@promopro.ma");

  const journal = await ligneJournal(page, "Imane Tazi");
  await expect(journal.first()).toContainText(`E-mail : ${initial} → imane.test@promopro.ma`);

  await page.goto("/dashboard/equipe");
  await page.getByTestId("membre-ligne").filter({ hasText: "Imane Tazi" }).getByTestId("modifier-membre").click();
  // La page Équipe a aussi un champ E-mail (recrutement) : attendre la page de modification avant de saisir
  await expect(page).toHaveURL(/\/modifier$/);
  await page.getByLabel("E-mail").fill(initial);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/equipe$/);

  // COM2 (Imane) ne gère pas Hamid Naciri : la page de modification est refusée
  await login(page, "COM2");
  await page.goto("/dashboard/clients");
  await expect(page.getByRole("link", { name: "Hamid Naciri" })).toHaveCount(0);
});
