import { expect, test } from "@playwright/test";
import {
  choisirTranche,
  deposerFichier,
  hrefBienStaff,
  ligneTrancheClient,
  ligneTrancheStaff,
  login,
  ouvrirBienClient,
  texteDuPdf,
} from "./helpers";

/**
 * Module Paiements (section 9 + 6.8) sur la vente A01 du seed :
 * le commercial saisit la tranche 2 → le Comptable Interne la référence et la
 * valide → reçu PDF, échéance « Payée », contrat régénéré avec la référence,
 * reçu visible côté client.
 */
test.describe.configure({ mode: "serial" });

const REFERENCE = "VIR-E2E-T2-0001";
let hrefA01 = "";

test("le commercial saisit l'encaissement de la tranche 2 avec preuve", async ({ page }) => {
  await login(page, "COM1");
  hrefA01 = await hrefBienStaff(page, "Appartement A01");
  await page.goto(hrefA01);
  await expect(page.getByText("Saisir un encaissement")).toBeVisible();

  const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
  await choisirTranche(form, 2);
  await form.locator('select[name="natureOperation"]').selectOption("virement local");
  await form.getByLabel("Banque").fill("BMCE Bank");
  await form.getByLabel("Date de l'opération").fill("2026-09-20");
  await form.getByLabel("Montant", { exact: true }).fill("170000");
  await form.getByLabel("Porteur de l'opération").fill("Hamid Naciri");
  await deposerFichier(form, "preuveUrl", [{ name: "preuve-virement.png" }]);
  await form.getByRole("button", { name: "Enregistrer le paiement" }).click();

  await expect(page.getByText("transmis au Comptable Interne")).toBeVisible();
  await expect(page.getByText("En attente comptable")).toBeVisible();
});

test("le Comptable Interne complète la référence et valide : reçu PDF et tranche payée", async ({ page }) => {
  await login(page, "COMPTA");
  await page.goto("/dashboard/paiements");
  const carteIndex = page.locator("[data-card]", { hasText: "Appartement A01" }).filter({ hasText: "Tranche 2" });
  await expect(carteIndex).toHaveCount(1);
  await expect(carteIndex.getByRole("link", { name: "Preuve de paiement" })).toBeVisible();
  // L'index ne porte aucune action : la validation se fait sur la fiche du client, onglet Échéancier & Paiements
  await expect(carteIndex.getByRole("button", { name: "Valider" })).toHaveCount(0);
  await carteIndex.getByTestId("lien-fiche-client").click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+\?bien=[^&]+&onglet=paiements$/);
  const carte = page.getByTestId("onglet-paiements").locator("[data-card]", { hasText: "Tranche 2" }).filter({ has: page.getByTestId("form-completer") });
  await expect(carte).toHaveCount(1);
  await carte.getByLabel("Référence").fill(REFERENCE);
  await carte.getByLabel("Date de réception").fill("2026-09-21");
  await carte.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByTestId("onglet-paiements").getByText("Aucune opération en attente")).toBeVisible();
  await expect(page.getByTestId("ligne-paiement").filter({ hasText: REFERENCE })).toHaveCount(1);

  await page.goto("/dashboard/paiements");
  await expect(page.getByText("Aucune opération en attente")).toBeVisible();
  const ligne = page.locator("table tbody tr", { hasText: REFERENCE });
  await expect(ligne).toHaveCount(1);
  await expect(ligne.getByText("Validé")).toBeVisible();
  const recu = ligne.getByRole("link", { name: "Reçu" });
  const href = await recu.getAttribute("href");
  expect(href).toMatch(/^\/api\/files\/recus\/.+\.pdf$/);
  const reponse = await page.request.get(href!);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toContain("application/pdf");

  // L'échéance 2 est soldée sur la fiche du bien
  await page.goto(hrefA01);
  await expect(ligneTrancheStaff(page, 2).getByText("Payée")).toBeVisible();
});

test("le contrat régénéré contient la référence comptable (section 9.1)", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto("/dashboard/contrats");
  const ligne = page.locator("table tbody tr", { hasText: "Appartement A01" });
  const href = await ligne.getByRole("link", { name: "Contrat PDF" }).getAttribute("href");
  const reponse = await page.request.get(href!);
  expect(reponse.status()).toBe(200);
  const texte = texteDuPdf(await reponse.body());
  expect(texte).toContain(REFERENCE);
  expect(texte).toContain("VIR-2026-00458"); // référence de la tranche 1 (seed) toujours présente
});

test("le client voit le paiement validé et télécharge son reçu", async ({ page }) => {
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const ligne = page.locator("li", { hasText: REFERENCE });
  await expect(ligne).toHaveCount(1);
  await expect(ligne.getByText("Validé")).toBeVisible();
  const href = await ligne.getByRole("link", { name: "Reçu PDF" }).getAttribute("href");
  const reponse = await page.request.get(href!);
  expect(reponse.status()).toBe(200);
  // Seule la tranche 2 est concernée par cette spec (les autres specs jouent sur T3/T4).
  await expect(ligneTrancheClient(page, 2).getByText("Payée")).toBeVisible();
});
