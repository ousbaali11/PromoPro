import { expect, test, type Page } from "@playwright/test";
import { deposerFichier, forgerArgumentAction, hrefBienStaff, login, SUFFIXE_RUN } from "./helpers";

/*
 * Visibilité d'un client entre commerciaux du même promoteur : la règle
 * unique du pôle commercial (peutConsulterDossierClient) s'applique aussi à
 * la fiche d'un bien et à la nouvelle proposition. COM2 vend un bien à son
 * client ; COM1, qui n'est ni le commercial du bien ni celui du client, ne
 * voit sur la fiche du bien que « Vendu », sans nom, lien, téléphone,
 * échéancier ni paiements ; COM2 garde tout (exception « commercial du
 * bien » intacte). Le formulaire de proposition de COM1 ne liste que ses
 * clients, et l'action refuse un identifiant de client substitué. Vente de
 * test nettoyée par désistement remboursé.
 */
test.describe.configure({ mode: "serial" });

const S = SUFFIXE_RUN;
const V = { bien: `Appartement VIS${S}`, bienDispo: `Appartement VIS2${S}`, clientNom: `Visibilite${S}`, bienHref: "", clientId: "" };

async function ajouterBien(page: Page, designation: string) {
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(designation);
  await form.getByLabel(/Prix/).fill("650000");
  await form.getByLabel(/Surface/).fill("68");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: designation, exact: true })).toBeVisible();
}

test("mise en place : deux biens du Directeur Commercial, un client de COM2, vente conclue par COM2", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, "DIRCOM");
  await ajouterBien(page, V.bien);
  await ajouterBien(page, V.bienDispo);

  await login(page, "COM2");
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(V.clientNom);
  await page.getByLabel("Prénom").fill("Samir");
  await page.getByLabel("Téléphone 1").fill("06 55 44 33 22");
  await page.getByLabel("E-mail").fill(`samir.${S.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByTestId("bloc-acces").first()).toBeVisible();
  await page.goto("/dashboard/clients");
  const lienClient = page.getByRole("link", { name: new RegExp(V.clientNom) }).first();
  V.clientId = (await lienClient.getAttribute("href"))!.split("/").pop()!;
  expect(V.clientId).toMatch(/^[0-9a-f-]{36}$/);

  V.bienHref = await hrefBienStaff(page, V.bien);
  await page.goto(V.bienHref);
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  const select = page.locator("#clientId");
  const valeur = await select.evaluate((el, nom) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.includes(nom))?.value ?? "", V.clientNom);
  expect(valeur).not.toBe("");
  await select.selectOption(valeur);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: V.bien });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();
});

test("fiche du bien : COM1 ne voit que « Vendu » ; COM2, commercial du bien, voit le client, son téléphone, l'échéancier et les paiements", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(V.bienHref);
  await expect(page.getByTestId("client-masque")).toHaveText("Vendu");
  await expect(page.getByTestId("lien-client-du-bien")).toHaveCount(0);
  await expect(page.getByText("Samir")).toHaveCount(0);
  await expect(page.getByText(V.clientNom)).toHaveCount(0);
  await expect(page.getByText("06 55 44 33 22")).toHaveCount(0);
  await expect(page.getByTestId("table-echeancier")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Paiements" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enregistrer un désistement" })).toHaveCount(0);

  await login(page, "COM2");
  await page.goto(V.bienHref);
  await expect(page.getByTestId("lien-client-du-bien")).toContainText(`Samir ${V.clientNom}`);
  await expect(page.getByTestId("client-masque")).toHaveCount(0);
  await expect(page.getByText("06 55 44 33 22")).toBeVisible();
  await expect(page.getByTestId("table-echeancier")).toBeVisible();
  await expect(page.getByTestId("ligne-echeance").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paiements" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer un désistement" })).toBeVisible();
});

test("nouvelle proposition : la liste de COM1 ne contient que ses clients ; un identifiant de client substitué est refusé par l'action ; COM1 propose toujours à son propre client", async ({ page }) => {
  await login(page, "COM1");
  const hrefDispo = await hrefBienStaff(page, V.bienDispo);
  await page.goto(hrefDispo);
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  const select = page.locator("#clientId");
  const options = await select.evaluate((el) => [...(el as HTMLSelectElement).options].map((o) => `${o.value}|${o.textContent}`));
  expect(options.some((o) => o.includes("Naciri"))).toBe(true);
  expect(options.some((o) => o.includes(V.clientNom))).toBe(false);
  expect(options.some((o) => o.startsWith(`${V.clientId}|`))).toBe(false);
  expect(options.some((o) => o.includes("+ Nouveau client"))).toBe(true);

  // Contournement de l'interface : l'identifiant du client de COM2 substitué à celui de Naciri dans la requête
  const valeurNaciri = await select.evaluate((el) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.includes("Naciri"))?.value ?? "");
  expect(valeurNaciri).not.toBe("");
  await select.selectOption(valeurNaciri);
  const retirer = await forgerArgumentAction(page, valeurNaciri, V.clientId);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page.getByText("Vous ne gérez pas ce client")).toBeVisible();
  await retirer();
  await expect(page).toHaveURL(/\/dashboard\/propositions\/nouvelle/);
  // Le bien n'a pas été réservé
  await page.goto(hrefDispo);
  await expect(page.getByText("Disponible", { exact: true }).first()).toBeVisible();

  // Flux légitime intact : proposition de COM1 pour SON client, puis refus par le PDG pour libérer le bien
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  await page.locator("#clientId").selectOption(valeurNaciri);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
  await expect(page.getByText(V.bienDispo).first()).toBeVisible();
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: V.bienDispo });
  await carte.getByRole("button", { name: "Refuser" }).click();
  await expect(carte.getByText("Refusée")).toBeVisible();
});

test("nettoyage : désistement de la vente de test, traité jusqu'au remboursement", async ({ page }) => {
  await login(page, "COM2");
  await page.goto(V.bienHref);
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-visibilite.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  await page.locator("[data-card]", { hasText: V.bien }).getByTestId("lien-fiche-client").click();
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await dossier.getByLabel("Décharge").fill("Nettoyage du test de visibilité");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
});
