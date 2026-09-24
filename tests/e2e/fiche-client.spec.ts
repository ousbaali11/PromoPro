import { expect, test, type Page } from "@playwright/test";
import { deposerFichier, hrefBienStaff, login } from "./helpers";

/*
 * Fiche client = point d'entrée unique de gestion (phase 1 de la
 * restructuration). Un client avec DEUX biens : sélecteur de bien, onglets
 * (Contrat, Échéancier & Paiements, Travaux modificatifs, Documents) qui ne
 * montrent que le bien sélectionné, et confirmation du contrat d'un bien sans
 * effet sur l'autre. Les pages Contrats / Paiements / Désistements / SAV ne
 * sont plus que des index qui renvoient vers la fiche.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = Date.now().toString(36).toUpperCase().slice(-4);
const F01 = `Appartement F1${SUFFIXE}`;
const F02 = `Appartement F2${SUFFIXE}`;
const CLIENT = { nom: `Double${SUFFIXE}`, prenom: "Fiche" };
let hrefClient = "";

async function ajouterBien(page: Page, designation: string, prix: string) {
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(designation);
  await form.getByLabel(/Prix/).fill(prix);
  await form.getByLabel(/Surface/).fill("70");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: designation, exact: true })).toBeVisible();
}

async function proposer(page: Page, designation: string, client: "nouveau" | "existant") {
  await page.goto(await hrefBienStaff(page, designation));
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  const select = page.locator("#clientId");
  if (client === "nouveau") {
    await select.selectOption("__nouveau__");
    await page.locator("#clientNom").fill(CLIENT.nom);
    await page.locator("#clientPrenom").fill(CLIENT.prenom);
    await page.locator("#clientTelephone1").fill("06 77 00 00 09");
    await page.locator("#clientEmail").fill(`fiche.${SUFFIXE.toLowerCase()}@exemple.ma`);
  } else {
    const valeur = await select.evaluate((el, nom) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.includes(nom))?.value ?? "", CLIENT.nom);
    expect(valeur).not.toBe("");
    await select.selectOption(valeur);
  }
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
}

async function accepter(page: Page, designation: string) {
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: designation });
  await expect(carte).toHaveCount(1);
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();
}

test("mise en place : deux biens vendus au même client", async ({ page }) => {
  await login(page, "DIRCOM");
  await ajouterBien(page, F01, "600000");
  await ajouterBien(page, F02, "800000");
  await login(page, "COM1");
  await proposer(page, F01, "nouveau");
  await accepter(page, F01);
  await login(page, "COM1");
  await proposer(page, F02, "existant");
  await accepter(page, F02);
});

test("sélecteur de bien et onglets : chaque onglet ne montre que le bien sélectionné", async ({ page }) => {
  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: new RegExp(`${CLIENT.prenom} ${CLIENT.nom}`) }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
  hrefClient = page.url().split("?")[0];

  const selecteur = page.getByTestId("selecteur-biens-client");
  await expect(selecteur.getByRole("link")).toHaveCount(2);
  // Onglets soulignés : même motif que la navigation de l'espace client (indicateur doré sur l'onglet courant)
  const onglets = page.getByTestId("onglets-dossier");
  await expect(onglets.getByRole("link", { name: "Contrat" })).toHaveAttribute("aria-current", "page");
  await expect(onglets.getByTestId("onglet-indicateur")).toHaveCount(1);
  await expect(page.getByTestId("bien-selectionne")).toHaveText(F01);
  await expect(page.getByTestId("onglet-contrat").getByTestId("carte-contrat")).toHaveAttribute("data-statut", "EN_ATTENTE");

  // Bien F02 : contrat propre, échéancier propre (4 tranches sur 800 000)
  await selecteur.getByRole("link", { name: F02 }).click();
  await expect(page).toHaveURL(/onglet=contrat/);
  await expect(page.getByTestId("bien-selectionne")).toHaveText(F02);
  await page.getByTestId("onglets-dossier").getByRole("link", { name: "Échéancier & Paiements" }).click();
  await expect(page).toHaveURL(/onglet=paiements/);
  await expect(page.getByTestId("onglet-paiements").getByTestId("ligne-echeance")).toHaveCount(4);
  await expect(page.getByTestId("onglet-paiements").getByTestId("ligne-echeance").first()).toContainText("320 000");
  await expect(page.getByTestId("section-saisie-paiement")).toBeVisible(); // commercial du bien : saisie d'un encaissement ici

  // Retour sur F01 en gardant l'onglet : 4 tranches sur 600 000, aucune trace de F02
  await selecteur.getByRole("link", { name: F01 }).click();
  await expect(page).toHaveURL(/onglet=paiements/);
  await expect(page.getByTestId("bien-selectionne")).toHaveText(F01);
  await expect(page.getByTestId("onglet-paiements").getByTestId("ligne-echeance").first()).toContainText("240 000");
  await expect(page.getByTestId("onglet-paiements")).not.toContainText(F02);

  for (const [onglet, testId] of [
    ["Travaux modificatifs", "onglet-tma"],
    ["Documents", "onglet-documents"],
  ] as const) {
    await page.getByTestId("onglets-dossier").getByRole("link", { name: onglet }).click();
    await expect(page.getByTestId(testId)).toBeVisible();
  }
});

test("le Responsable Administratif confirme le contrat de F01 depuis la fiche : F02 n'est pas touché ; les index n'ont plus d'action", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto("/dashboard/contrats");
  const ligneF01 = page.getByTestId("contrat-ligne").filter({ hasText: F01 });
  await expect(ligneF01.getByRole("button", { name: "Vérifier et confirmer" })).toHaveCount(0);
  await ligneF01.getByTestId("lien-fiche-client").click();
  await expect(page).toHaveURL(/onglet=contrat/);
  await expect(page.getByTestId("bien-selectionne")).toHaveText(F01);

  const carte = page.getByTestId("carte-contrat");
  await page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click(); // première génération = confirmation
  await expect(carte).toHaveAttribute("data-statut", "PRET");
  await expect(carte.getByRole("link", { name: "Contrat PDF" })).toBeVisible();

  // F02 reste en attente, sans PDF
  await page.getByTestId("selecteur-biens-client").getByRole("link", { name: F02 }).click();
  await expect(page.getByTestId("bien-selectionne")).toHaveText(F02);
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "EN_ATTENTE");
  await expect(page.getByTestId("carte-contrat").getByRole("link", { name: "Contrat PDF" })).toHaveCount(0);
  await page.getByTestId("onglets-dossier").getByRole("link", { name: "Documents" }).click();
  await expect(page.getByTestId("onglet-documents")).not.toContainText("Contrat de vente (PDF)");

  // Documents de F01 : le contrat généré y figure
  await page.getByTestId("selecteur-biens-client").getByRole("link", { name: F01 }).click();
  await expect(page.getByTestId("onglet-documents")).toContainText("Contrat de vente (PDF)");

  // Les index Paiements et Désistements ne portent plus de formulaire d'action
  await login(page, "COMPTA");
  await page.goto("/dashboard/paiements");
  await expect(page.getByTestId("form-completer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Valider le syndic" })).toHaveCount(0);
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  await expect(page.getByRole("button", { name: "Papiers vérifiés" })).toHaveCount(0);
  await expect(page.getByTestId("form-rembourser")).toHaveCount(0);
  expect(hrefClient).toMatch(/\/dashboard\/clients\//);
});

test("nettoyage : désistement des deux ventes, traité jusqu'au remboursement depuis la fiche (biens marqués « désisté » dans le sélecteur)", async ({ page }) => {
  await login(page, "COM1");
  for (const designation of [F01, F02]) {
    await page.goto(await hrefBienStaff(page, designation));
    await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
    const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
    await deposerFichier(form, "documentUrl", [{ name: `desistement-${designation.slice(-6)}.png` }]);
    await form.getByRole("button", { name: "Confirmer le désistement" }).click();
    await expect(page).toHaveURL(/\/dashboard\/desistes$/);
  }

  await login(page, "RESPADM");
  await page.goto(hrefClient);
  const selecteur = page.getByTestId("selecteur-biens-client");
  await expect(selecteur.getByRole("link", { name: `${F01} (désisté)` })).toBeVisible();
  await expect(selecteur.getByRole("link", { name: `${F02} (désisté)` })).toBeVisible();
  for (const designation of [F01, F02]) {
    await selecteur.getByRole("link", { name: `${designation} (désisté)` }).click();
    await expect(page.getByTestId("bien-selectionne")).toHaveText(designation);
    await page.getByTestId("onglets-dossier").getByRole("link", { name: "Contrat" }).click();
    await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "ANNULE");
    const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
    await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
    await expect(dossier.getByText("Vérifié — remboursement en cours")).toBeVisible();
    await dossier.getByLabel("Décharge").fill("Nettoyage du test de la fiche client");
    await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
    await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
  }
  await page.goto("/dashboard/desistements");
  await expect(page.getByText("Aucun désistement en attente")).toBeVisible();
});
