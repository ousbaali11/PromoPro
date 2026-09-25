import { expect, test, type Page } from "@playwright/test";
import { choisirTranche, deposerFichier, hrefBienStaff, login, loginAvec, ymd, SUFFIXE_RUN, ouvrirFicheClientDepuisListe } from "./helpers";

/*
 * Désistement et paiements en attente : les opérations saisies (par le
 * client, par le commercial) mais pas encore validées par le Comptable
 * Interne sont annulées automatiquement au désistement (statut
 * ANNULE_DESISTEMENT, jamais supprimées), le comptable est notifié, et elles
 * apparaissent comme « Annulé (désistement) » — plus jamais comme une
 * opération normale en attente ni validable.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const D = { bien: `Appartement DP${SUFFIXE}`, clientNom: `Desist${SUFFIXE}`, clientPrenom: "Omar", bienHref: "", hrefFiche: "", client: { identifiant: "", mdp: "" } };
const nomClient = () => `${D.clientPrenom} ${D.clientNom}`;

async function lireAcces(bloc: ReturnType<Page["getByTestId"]>) {
  const dd = bloc.locator("dd");
  return { identifiant: (await dd.nth(0).innerText()).trim(), mdp: (await dd.nth(1).innerText()).trim() };
}

test("mise en place : vente conclue, un paiement déclaré par le client et un saisi par le commercial, tous deux en attente comptable", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(D.bien);
  await form.getByLabel(/Prix/).fill("600000");
  await form.getByLabel(/Surface/).fill("70");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: D.bien, exact: true })).toBeVisible();

  await login(page, "COM1");
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(D.clientNom);
  await page.getByLabel("Prénom").fill(D.clientPrenom);
  await page.getByLabel("Téléphone 1").fill("06 77 00 00 13");
  await page.getByLabel("E-mail").fill(`desist.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  D.client = await lireAcces(page.getByTestId("bloc-acces"));
  D.bienHref = await hrefBienStaff(page, D.bien);
  await page.goto(D.bienHref);
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  const select = page.locator("#clientId");
  const valeur = await select.evaluate((el, nom) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.includes(nom))?.value ?? "", D.clientNom);
  expect(valeur).not.toBe("");
  await select.selectOption(valeur);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: D.bien });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();

  // Commercial : paiement saisi sur la tranche 2 (en attente comptable)
  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  await ouvrirFicheClientDepuisListe(page, new RegExp(D.clientNom));
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
  D.hrefFiche = page.url().split("?")[0];
  await page.goto(D.bienHref);
  const formStaff = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
  await choisirTranche(formStaff, 2);
  await formStaff.getByLabel("Banque").fill("Banque désistement");
  await formStaff.getByLabel("Date de l'opération").fill(ymd(new Date()));
  await formStaff.getByLabel("Montant", { exact: true }).fill("120000");
  await formStaff.getByLabel("Porteur de l'opération").fill(nomClient());
  await deposerFichier(formStaff, "preuveUrl", [{ name: "preuve-staff-desist.png" }]);
  await formStaff.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByTestId("paiement-succes")).toBeVisible();

  // Client : paiement déclaré sur la tranche 1 (en vérification)
  await loginAvec(page, D.client.identifiant, D.client.mdp, /\/client(\/biens\/[^/]+)?$/);
  await page.goto("/client");
  await page.waitForURL(/\/client\/biens\/[^/]+$/);
  await page.getByRole("button", { name: "Ajouter un paiement" }).click();
  const formClient = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
  await choisirTranche(formClient, 1);
  await formClient.getByLabel("Banque").fill("CIH désistement");
  await formClient.getByLabel("Date de l'opération").fill(ymd(new Date()));
  await formClient.getByLabel("Montant", { exact: true }).fill("240000");
  await formClient.getByLabel("Porteur de l'opération").fill(nomClient());
  await deposerFichier(formClient, "preuveUrl", [{ name: "preuve-client-desist.png" }]);
  await formClient.getByRole("button", { name: "Déclarer ce paiement" }).click();
  await expect(page.getByText(/Paiement déclaré/)).toBeVisible();

  // Le comptable voit deux opérations en attente sur ce bien
  await login(page, "COMPTA");
  await page.goto("/dashboard/paiements");
  await expect(page.locator("[data-card]", { hasText: D.bien }).filter({ has: page.getByTestId("lien-fiche-client") })).toHaveCount(2);
});

test("désistement : les deux opérations en attente sont annulées, le comptable est notifié, elles n'apparaissent plus comme à valider", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(D.bienHref);
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-paiements.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);

  await login(page, "COMPTA");
  await page.goto("/dashboard/paiements");
  await expect(page.locator("[data-card]", { hasText: D.bien }).filter({ has: page.getByTestId("lien-fiche-client") })).toHaveCount(0);
  const annules = page.getByTestId("section-paiements-annules").getByTestId("paiement-annule").filter({ hasText: D.bien });
  await expect(annules).toHaveCount(2);
  await expect(annules.first()).toContainText("Annulé (désistement)");
  await expect(page.getByTestId("table-paiements-valides").locator("tbody tr", { hasText: D.bien })).toHaveCount(0);
  // Notification du comptable
  await page.getByTestId("cloche-notifications").click();
  await expect(page.getByText("Opérations en attente annulées").first()).toBeVisible();
  await expect(page.getByText(new RegExp(`2 opération\\(s\\) en attente sur ${D.bien}`)).first()).toBeVisible();
  // Fiche client : section dédiée, aucun formulaire de validation
  await page.goto(`${D.hrefFiche}?onglet=paiements`);
  await expect(page.getByTestId("section-paiements-annules").getByTestId("paiement-annule")).toHaveCount(2);
  await expect(page.getByTestId("form-completer")).toHaveCount(0);
  await expect(page.getByTestId("ligne-paiement")).toHaveCount(0);
  // Journal (PDG) : désistement tracé avec le nombre d'opérations annulées
  await login(page, "PDG");
  await page.goto("/dashboard/journal?periode=jour");
  await expect(page.getByTestId("journal-ligne").filter({ hasText: D.bien }).filter({ hasText: "2 paiement(s) en attente annulé(s)" })).toHaveCount(1);
});

test("nettoyage : désistement traité jusqu'au remboursement (rien à rembourser : aucune opération validée)", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  await page.locator("[data-card]", { hasText: D.bien }).getByTestId("lien-fiche-client").click();
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await dossier.getByLabel("Décharge").fill("Nettoyage du test désistement / paiements");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
});
