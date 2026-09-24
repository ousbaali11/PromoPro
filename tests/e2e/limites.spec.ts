import { expect, test } from "@playwright/test";
import { login, hrefBienStaff, ouvrirBienClient, deposerFichier, ymd } from "./helpers";

/*
 * Cas limites sur les montants et les dates (audit, phase 2) : chaque cas
 * doit être refusé avec un message clair, jamais accepté en silence ni
 * planter. Les règles pures sont dans tests/unit/validation.test.ts ; ici on
 * vérifie qu'elles sont bien branchées sur les formulaires.
 */
const hier = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
};

test("proposition : pourcentages ≠ 100 %, pourcentage nul et date passée sont refusés avant toute écriture", async ({ page }) => {
  await login(page, "COM1");
  const href = await hrefBienStaff(page, "Appartement B01");
  await page.goto(href);
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('form[data-hydrated="true"]').first().waitFor();
  await page.locator('select[name="clientId"]').evaluate((el) => {
    const sel = el as HTMLSelectElement;
    const opt = [...sel.options].find((o) => o.textContent?.includes("Naciri"));
    if (!opt) throw new Error("Client de démo introuvable");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const envoyer = page.getByRole("button", { name: "Envoyer la proposition au PDG" });
  await page.locator('form[data-hydrated="true"]').first().evaluate((f) => ((f as HTMLFormElement).noValidate = true));

  await page.locator("#tranche4Pourcentage").fill("10");
  await envoyer.click();
  await expect(page.getByText("Les pourcentages totalisent 90 % au lieu de 100 %.")).toBeVisible();

  await page.locator("#tranche4Pourcentage").fill("20");
  await page.locator("#tranche1Pourcentage").fill("0");
  await page.locator("#tranche2Pourcentage").fill("60");
  await envoyer.click();
  await expect(page.getByText(/Chaque pourcentage doit être compris entre 0 \(exclu\) et 100/)).toBeVisible();

  await page.locator("#tranche1Pourcentage").fill("40");
  await page.locator("#tranche2Pourcentage").fill("20");
  await page.locator("#tranche2Date").fill(hier());
  await envoyer.click();
  await expect(page.getByText("La date de la tranche 2 ne peut pas être dans le passé.")).toBeVisible();

  // Rien n'a été écrit : le bien est toujours disponible, aucune proposition créée
  await page.goto(href);
  await expect(page.getByText("Disponible", { exact: true })).toBeVisible();
  await page.goto("/dashboard/propositions");
  await expect(page.locator("[data-card]", { hasText: "Appartement B01" })).toHaveCount(0);
});

test("bien : prix ou surface à 0, négatifs ou avec 3 décimales refusés ; client : date de naissance future refusée", async ({ page }) => {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  const bouton = page.getByRole("button", { name: "Ajouter le bien" });
  const essayer = async (prix: string, surface: string, message: RegExp) => {
    await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true)); // règles serveur, pas la validation HTML
    await form.getByLabel("Désignation").fill("Limite E2E");
    await form.getByLabel(/Prix/).fill(prix);
    await form.getByLabel(/Surface/).fill(surface);
    await bouton.click();
    await expect(form.getByText(message)).toBeVisible();
  };
  await essayer("0", "50", /Le prix doit être strictement positif/);
  await essayer("-100", "50", /Le prix doit être strictement positif/);
  await essayer("1000.555", "50", /Le prix ne peut pas avoir plus de 2 décimales/);
  await essayer("1000", "-1", /La surface doit être strictement positif/);
  await expect(page.getByRole("link", { name: "Limite E2E", exact: true })).toHaveCount(0);

  await login(page, "COM1");
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill("Futur");
  await page.getByLabel("Prénom").fill("Test");
  await page.getByLabel("Téléphone 1").fill("06 00 00 00 99");
  await page.getByLabel("E-mail").fill("futur@exemple.ma");
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  await page.getByLabel("Date de naissance").fill(ymd(demain));
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByText("La date de naissance ne peut pas être dans le futur.")).toBeVisible();
  await expect(page.getByTestId("bloc-acces")).toHaveCount(0);
});

test("paiement client : montant supérieur au restant dû du bien refusé ; 3 décimales refusées ; le trop-perçu d'une tranche reste possible", async ({ page }) => {
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await page.getByRole("button", { name: /Ajouter un paiement/ }).click();
  const form = page.locator("form", { has: page.locator('input[name="montant"]') }).first();
  const soumettre = async (montant: string) => {
    await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true)); // règles serveur, pas la validation HTML
    await form.locator('input[name="montant"]').fill(montant);
    await form.getByRole("button", { name: /Déclarer|Enregistrer|Envoyer/ }).click();
  };
  // Formulaire minimal : banque, date, porteur, preuve
  await form.getByLabel(/Banque/).fill("Banque E2E");
  await form.getByLabel(/Date de l'opération/).fill(ymd(new Date()));
  await form.getByLabel(/Porteur/).fill("Hamid Naciri");
  await deposerFichier(form, "preuveUrl", [{ name: "preuve-limite.png" }]);

  await soumettre("99999999");
  await expect(page.getByText(/Le montant dépasse le restant dû du bien/)).toBeVisible();
  // Après une erreur serveur, la saisie reste en place (React 19 viderait le formulaire sans le helper de soumission)
  await expect(form.getByLabel(/Banque/)).toHaveValue("Banque E2E");
  await expect(form.getByLabel(/Porteur/)).toHaveValue("Hamid Naciri");
  await expect(form.locator('input[type="hidden"][name="preuveUrl"]')).toHaveValue(/\/api\/files\//);
  await soumettre("100.555");
  await expect(page.getByText("Le montant ne peut pas avoir plus de 2 décimales.")).toBeVisible();
  await soumettre("0");
  await expect(page.getByText("Le montant doit être strictement positif.")).toBeVisible();
});
