import { expect, test, type Page } from "@playwright/test";
import { confirmer, deposerFichier, hrefBienStaff, login, SUFFIXE_RUN } from "./helpers";

/*
 * Écran « Gérer le modèle par défaut » (Responsable Administratif), séparé
 * de l'édition d'un contrat : les champs dynamiques sont des étiquettes
 * insérées par un bouton, jamais tapées. Le modèle hérité du seed e2e
 * (jetons en texte, converti par la migration) s'affiche avec ses étiquettes ;
 * une section ajoutée avec un champ inséré se retrouve, remplie avec les
 * vraies données, dans le contrat d'un autre client créé ensuite.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const BIEN = `Appartement M1${SUFFIXE}`;
const CLIENT = { nom: `Modele${SUFFIXE}`, prenom: "Contrat" };

async function vendre(page: Page) {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const ajout = page.getByTestId("form-ajout-bien");
  await ajout.getByLabel("Désignation").fill(BIEN);
  await ajout.getByLabel(/Prix/).fill("640000");
  await ajout.getByLabel(/Surface/).fill("66");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: BIEN, exact: true })).toBeVisible();

  await login(page, "COM1");
  await page.goto(await hrefBienStaff(page, BIEN));
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  await page.locator("#clientId").selectOption("__nouveau__");
  await page.locator("#clientNom").fill(CLIENT.nom);
  await page.locator("#clientPrenom").fill(CLIENT.prenom);
  await page.locator("#clientTelephone1").fill("06 44 00 00 03");
  await page.locator("#clientEmail").fill(`modele.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);

  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: BIEN });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();
}

test("modèle hérité converti : étiquettes de champ, aucun jeton ; ajout d'une section avec un champ inséré par le bouton", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto("/dashboard/contrats");
  await page.getByTestId("lien-modele-defaut").click();
  await expect(page).toHaveURL(/\/dashboard\/contrats\/modele$/);
  const editeur = page.getByTestId("editeur-modele");
  const sections = editeur.getByTestId("section-modele");
  await expect(sections).toHaveCount(6);
  await expect(editeur).not.toContainText("{{");
  const premiere = sections.first().getByTestId("zone-segments");
  await expect(premiere.getByTestId("champ-etiquette").filter({ hasText: "Nom du promoteur" })).toBeVisible();
  await expect(premiere.getByTestId("champ-etiquette").filter({ hasText: "Nom du client" })).toBeVisible();
  await expect(premiere).toContainText("Le vendeur :");
  await expect(premiere.getByTestId("champ-etiquette").first()).toHaveClass(/rounded-full/); // même rendu que les Badge

  // Nouvelle section : texte libre + champ inséré par le bouton (pas tapé)
  await editeur.getByTestId("ajouter-section-modele").click();
  await expect(sections).toHaveCount(7);
  const nouvelle = sections.last();
  await nouvelle.getByLabel("Titre de la section").fill("Garantie");
  const zone = nouvelle.getByTestId("zone-segments");
  await zone.click();
  await page.keyboard.type("Le vendeur garantit le bien ");
  await nouvelle.getByTestId("inserer-champ").click();
  await page.getByRole("menuitem", { name: "Désignation du bien" }).click();
  await expect(zone.getByTestId("champ-etiquette").filter({ hasText: "Désignation du bien" })).toBeVisible();
  await page.keyboard.type(" pendant dix ans au profit de "); // l'espace se tape comme dans un traitement de texte
  await nouvelle.getByTestId("inserer-champ").click();
  await page.getByRole("menuitem", { name: "Nom du client" }).click();
  await page.keyboard.type(".");
  await expect(zone.getByTestId("champ-etiquette")).toHaveCount(2);

  await editeur.getByTestId("enregistrer-modele").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Modèle par défaut enregistré" })).toBeVisible();
  await page.reload();
  const rechargees = page.getByTestId("editeur-modele").getByTestId("section-modele");
  await expect(rechargees).toHaveCount(7);
  const garantie = rechargees.last().getByTestId("zone-segments");
  await expect(garantie.getByTestId("champ-etiquette")).toHaveCount(2);
  await expect(garantie).toContainText("Le vendeur garantit le bien");
  await expect(garantie).not.toContainText("{{");
  // Une étiquette se retire d'un clic sur sa croix, sans toucher au texte
  await garantie.getByTestId("champ-etiquette").filter({ hasText: "Nom du client" }).getByRole("button", { name: /Retirer le champ/ }).click();
  await expect(garantie.getByTestId("champ-etiquette")).toHaveCount(1);
  await expect(garantie).toContainText("pendant dix ans au profit de");
});

test("un contrat créé ensuite pour un autre client reflète le modèle, rempli avec les données de ce dossier", async ({ page }) => {
  await vendre(page);
  await login(page, "RESPADM");
  await page.goto("/dashboard/contrats");
  await page.getByTestId("contrat-ligne").filter({ hasText: BIEN }).getByTestId("lien-fiche-client").click();
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "EN_ATTENTE");
  const sections = page.getByTestId("editeur-contrat").getByTestId("section-contrat");
  await expect(sections).toHaveCount(7);
  await expect(sections.last().getByLabel("Titre de la section")).toHaveValue("Garantie");
  await expect(sections.last().getByLabel("Texte")).toHaveValue(`Le vendeur garantit le bien ${BIEN} pendant dix ans au profit de ${CLIENT.nom.toUpperCase()} ${CLIENT.prenom}.`);
  await expect(sections.first().getByLabel("Texte")).toHaveValue(new RegExp(`${CLIENT.nom.toUpperCase()} ${CLIENT.prenom}`));
  await expect(page.getByTestId("editeur-contrat")).not.toContainText("{{");
  await expect(page.getByTestId("lien-modele-defaut")).toBeVisible();

  // Le contrat de la vente A01 (autre client) n'est pas touché par le changement de modèle
  await page.goto("/dashboard/contrats");
  await page.getByTestId("contrat-ligne").filter({ hasText: "Appartement A01" }).getByTestId("lien-fiche-client").click();
  await expect(page.getByTestId("editeur-contrat").getByTestId("section-contrat").filter({ has: page.getByLabel("Titre de la section") })).not.toHaveCount(0);
  await expect(page.getByTestId("editeur-contrat")).not.toContainText(BIEN);
});

test("nettoyage : désistement traité jusqu'au remboursement, modèle ramené au jeu intégré", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(await hrefBienStaff(page, BIEN));
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-modele.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);

  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  await page.locator("[data-card]", { hasText: BIEN }).getByTestId("lien-fiche-client").click();
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await dossier.getByLabel("Décharge").fill("Nettoyage du test du modèle de contrat");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();

  await page.goto("/dashboard/contrats/modele");
  await confirmer(page, "repartir-jeu-integre");
  await expect(page.getByTestId("toast").filter({ hasText: "jeu de sections intégré" })).toBeVisible();
  await expect(page.getByTestId("editeur-modele").getByTestId("section-modele")).toHaveCount(6);
});
