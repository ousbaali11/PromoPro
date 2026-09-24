import { expect, test, type Page } from "@playwright/test";
import { choisirTranche, deposerFichier, hrefBienStaff, login, ymd } from "./helpers";

/*
 * Échéancier flexible (phase 3). Sur une vente créée par le test :
 *  1. proposition avec une liste dynamique de tranches (retrait jusqu'à une
 *     seule tranche de 100 %, puis cinq tranches de 20 %), total en temps réel ;
 *  2. après un premier paiement validé, le commercial modifie l'échéancier
 *     depuis la fiche client : la tranche payée ne peut être ni retirée ni
 *     réduite sous son montant payé, le total doit rester 100 %, une 6e tranche
 *     est ajoutée sur les tranches en attente, le tout journalisé ;
 *  3. nettoyage par désistement (aucune vente supplémentaire laissée aux specs
 *     suivants, qui supposent une seule vente sur la page Recouvrement).
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = Date.now().toString(36).toUpperCase().slice(-4);
const BIEN = `Appartement G1${SUFFIXE}`;
const CLIENT = { nom: `Souple${SUFFIXE}`, prenom: "Echeancier" };
const PRIX = 500_000;
let hrefFiche = "";

function plusJours(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

async function ouvrirFiche(page: Page) {
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: new RegExp(`${CLIENT.prenom} ${CLIENT.nom}`) }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
  hrefFiche = `${page.url().split("?")[0]}`;
  await page.getByTestId("onglets-dossier").getByRole("link", { name: "Échéancier & Paiements" }).click();
  await expect(page).toHaveURL(/onglet=paiements/);
}

test("proposition : liste dynamique de tranches, 100 % en une fois puis cinq tranches de 20 %", async ({ page }) => {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const ajout = page.getByTestId("form-ajout-bien");
  await ajout.getByLabel("Désignation").fill(BIEN);
  await ajout.getByLabel(/Prix/).fill(String(PRIX));
  await ajout.getByLabel(/Surface/).fill("75");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: BIEN, exact: true })).toBeVisible();

  await login(page, "COM1");
  await page.goto(await hrefBienStaff(page, BIEN));
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  await page.locator("#clientId").selectOption("__nouveau__");
  await page.locator("#clientNom").fill(CLIENT.nom);
  await page.locator("#clientPrenom").fill(CLIENT.prenom);
  await page.locator("#clientTelephone1").fill("06 66 00 00 07");
  await page.locator("#clientEmail").fill(`souple.${SUFFIXE.toLowerCase()}@exemple.ma`);

  const lignes = page.getByTestId("tranche-ligne");
  await expect(lignes).toHaveCount(4);
  await expect(page.getByTestId("total-pourcentages")).toHaveText("Total 100%");
  // Une seule tranche de 100 %
  for (let i = 0; i < 3; i++) await lignes.last().getByTestId("retirer-tranche").click();
  await expect(lignes).toHaveCount(1);
  await expect(lignes.first().getByTestId("retirer-tranche")).toBeDisabled();
  await expect(page.getByTestId("total-pourcentages")).toHaveText("Total 40%");
  await page.locator("#tranche1Pourcentage").fill("100");
  await expect(page.getByTestId("total-pourcentages")).toHaveText("Total 100%");
  await expect(lignes.first()).toContainText("500 000");
  // Puis cinq tranches de 20 %
  for (let i = 0; i < 4; i++) await page.getByTestId("ajouter-tranche").click();
  await expect(lignes).toHaveCount(5);
  for (let n = 1; n <= 5; n++) await page.locator(`#tranche${n}Pourcentage`).fill("20");
  await expect(page.getByTestId("total-pourcentages")).toHaveText("Total 100%");
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);

  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: BIEN });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();

  await login(page, "COM1");
  await ouvrirFiche(page);
  const echeances = page.getByTestId("onglet-paiements").getByTestId("ligne-echeance");
  await expect(echeances).toHaveCount(5);
  await expect(echeances.first()).toContainText("100 000");
});

test("modification par le commercial : tranche payée protégée, total 100 % imposé, 6e tranche ajoutée et journalisée", async ({ page }) => {
  // Un premier paiement validé (recouvrement) : la tranche 1 devient « Payée »
  await login(page, "RECOUV");
  await page.goto("/dashboard/recouvrement");
  await page.getByRole("button", { name: new RegExp(`Ajouter un paiement pour ${CLIENT.prenom} ${CLIENT.nom}`) }).click();
  const paiement = page.locator("form", { has: page.locator('input[name="reference"]') }).filter({ has: page.locator('input[name="bienId"]') }).last();
  await choisirTranche(paiement, 1);
  await paiement.locator('select[name="natureOperation"]').selectOption("virement local");
  await paiement.getByLabel("Banque").fill("Attijariwafa");
  await paiement.getByLabel("Date de l'opération").fill(ymd(new Date()));
  await paiement.getByLabel("Montant", { exact: true }).fill("100000");
  await paiement.getByLabel("Porteur de l'opération").fill(`${CLIENT.prenom} ${CLIENT.nom}`);
  await paiement.getByLabel("Référence de l'opération").fill(`VIR-ECH-${SUFFIXE}`);
  await deposerFichier(paiement, "preuveUrl", [{ name: "preuve-ech.png" }]);
  await paiement.getByRole("button", { name: "Enregistrer et valider" }).click();
  await expect(page.getByText(new RegExp(`Paiement enregistré et validé pour ${CLIENT.prenom} ${CLIENT.nom}`))).toBeVisible();

  await login(page, "COM1");
  await ouvrirFiche(page);
  await page.getByTestId("modifier-echeancier").click();
  const form = page.getByTestId("form-echeancier");
  const lignes = form.getByTestId("tranche-edition");
  await expect(lignes).toHaveCount(5);
  await expect(lignes.first()).toHaveAttribute("data-statut", "PAYEE");
  await expect(lignes.first().getByTestId("retirer-tranche")).toHaveCount(0); // payée : pas de retrait
  await expect(form.getByTestId("retirer-tranche")).toHaveCount(4);

  // Réduire la tranche payée sous son montant payé : refusé côté serveur, la saisie reste en place
  await form.locator("#edition-tranche1Pourcentage").fill("10");
  await form.locator("#edition-tranche2Pourcentage").fill("30");
  await form.getByTestId("enregistrer-echeancier").click();
  await expect(form.getByTestId("echeancier-erreur")).toContainText("La tranche 1 a déjà reçu 100 000 MAD");
  await expect(form.locator("#edition-tranche2Pourcentage")).toHaveValue("30");

  // Total différent de 100 % : refusé
  await form.locator("#edition-tranche1Pourcentage").fill("20");
  await form.getByTestId("enregistrer-echeancier").click();
  await expect(form.getByTestId("echeancier-erreur")).toContainText("totalisent 110 % au lieu de 100 %");

  // 6e tranche : la 5e passe à 10 %, la nouvelle prend 10 %
  await form.locator("#edition-tranche2Pourcentage").fill("20");
  await form.locator("#edition-tranche5Pourcentage").fill("10");
  await form.getByTestId("ajouter-tranche").click();
  await expect(lignes).toHaveCount(6);
  await form.locator("#edition-tranche6Pourcentage").fill("10");
  await form.locator("#edition-tranche6Date").fill(ymd(plusJours(new Date(), 400)));
  await expect(form.getByTestId("total-pourcentages-edition")).toHaveText("Total 100%");
  await form.getByTestId("enregistrer-echeancier").click();
  await expect(page.getByTestId("toast").filter({ hasText: "6 tranche(s), total 100 %" })).toBeVisible();
  await expect(page.getByTestId("modifier-echeancier")).toBeVisible(); // formulaire replié, données fraîches

  const echeances = page.getByTestId("onglet-paiements").getByTestId("ligne-echeance");
  await expect(echeances).toHaveCount(6);
  await expect(echeances.first().getByText("Payée")).toBeVisible();
  await expect(echeances.nth(4)).toContainText("Tranche 5 · 10%");
  await expect(echeances.nth(5)).toContainText("Tranche 6 · 10%");
  await expect(echeances.nth(5)).toContainText("50 000");

  await login(page, "PDG");
  await page.goto("/dashboard/journal");
  await expect(page.getByText(new RegExp(`Échéancier ${BIEN}`)).first()).toBeVisible();
  await expect(page.getByText(/T6 10 % \(50 000 MAD/).first()).toBeVisible();
});

test("nettoyage : désistement traité jusqu'au remboursement", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(await hrefBienStaff(page, BIEN));
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-ech.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);

  await login(page, "RESPADM");
  await page.goto(`${hrefFiche}?onglet=contrat`);
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await dossier.getByLabel("Décharge").fill("Nettoyage du test d'échéancier");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
});
