import { expect, test } from "@playwright/test";
import { choisirTranche, deposerFichier, ligneTrancheStaff, ligneTrancheClient, login, ouvrirBienClient, ymd } from "./helpers";

/**
 * Recouvrement (section 13) sur l'échéancier de l'Appartement A01 :
 * filtres de période (serveur), paiement constaté pour le compte du client
 * (validé immédiatement, reçu, visible côté client), répercussion en trésorerie.
 */
test.describe.configure({ mode: "serial" });

const REFERENCE = "CHQ-E2E-T4-0003";

/** Même règle que src/lib/utils.ts (addMonths) : date de blocage du seed = aujourd'hui − 40 jours. */
function dateTranche4() {
  const d = new Date(Date.now() - 40 * 24 * 3600 * 1000);
  d.setMonth(d.getMonth() + 18);
  return d;
}
function plusJours(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

test("filtres de période : toutes, cette semaine (vide), période personnalisée autour de la tranche 4", async ({ page }) => {
  await login(page, "RECOUV");
  await page.goto("/dashboard/recouvrement");
  await expect(page.getByText("Toutes périodes · échéances")).toBeVisible();
  for (const n of [1, 2, 3, 4]) await expect(ligneTrancheStaff(page, n)).toHaveCount(1);
  await expect(ligneTrancheStaff(page, 1).getByText("Payée")).toBeVisible();

  await page.getByRole("link", { name: "Cette semaine" }).click();
  await expect(page).toHaveURL(/periode=semaine/);
  await expect(page.getByText("Cette semaine · échéances")).toBeVisible();
  await expect(page.getByText("Aucune échéance cette semaine.")).toBeVisible();

  const t4 = dateTranche4();
  await page.goto(`/dashboard/recouvrement?periode=perso&du=${ymd(plusJours(t4, -3))}&au=${ymd(plusJours(t4, 3))}`);
  await expect(page.getByText(/Du \d{4}-\d{2}-\d{2} au \d{4}-\d{2}-\d{2} · échéances/)).toBeVisible();
  await expect(ligneTrancheStaff(page, 4)).toHaveCount(1);
  await expect(ligneTrancheStaff(page, 1)).toHaveCount(0);
  await expect(page.locator("table tbody tr")).toHaveCount(1);
});

test("paiement constaté pour le compte du client : validé immédiatement, reçu, tranche soldée côté client", async ({ page }) => {
  await login(page, "RECOUV");
  await page.goto("/dashboard/recouvrement");
  const restantTexte = await ligneTrancheStaff(page, 4).locator("td").nth(2).textContent();
  const restant = Number((restantTexte ?? "").replace(/\D/g, ""));
  expect(restant).toBeGreaterThan(0);

  await page.getByRole("button", { name: /Ajouter un paiement pour Hamid Naciri/ }).click();
  const form = page.locator("form", { has: page.locator('input[name="reference"]') });
  await choisirTranche(form, 4);
  await form.locator('select[name="natureOperation"]').selectOption("cheque");
  await form.getByLabel("Date d'encaissement prévue").fill(ymd(plusJours(new Date(), 10)));
  await form.getByLabel("Banque").fill("Bank of Africa");
  await form.getByLabel("Date de l'opération").fill(ymd(new Date()));
  await form.getByLabel("Montant", { exact: true }).fill(String(restant));
  await form.getByLabel("Porteur de l'opération").fill("Hamid Naciri");
  await form.getByLabel("Référence de l'opération").fill(REFERENCE);
  await deposerFichier(form, "preuveUrl", [{ name: "cheque.png" }]);
  await form.getByRole("button", { name: "Enregistrer et valider" }).click();
  await expect(page.getByText(/Paiement enregistré et validé pour Hamid Naciri/)).toBeVisible();
  await expect(ligneTrancheStaff(page, 4).getByText("Payée")).toBeVisible();

  // Aucune étape comptable : déjà dans les validés, rien en attente
  await login(page, "COMPTA");
  await page.goto("/dashboard/paiements");
  const ligne = page.locator("table tbody tr", { hasText: REFERENCE });
  await expect(ligne.getByText("Validé")).toBeVisible();
  await expect(page.locator("div.rounded-xl", { hasText: REFERENCE }).filter({ hasText: "Valider" })).toHaveCount(0);

  // Visible aussitôt côté client, avec le reçu
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await expect(ligneTrancheClient(page, 4).getByText("Payée")).toBeVisible();
  const item = page.locator("li", { hasText: REFERENCE });
  await expect(item.getByText("Validé")).toBeVisible();
  const href = await item.getByRole("link", { name: "Reçu PDF" }).getAttribute("href");
  expect((await page.request.get(href!)).status()).toBe(200);
});

test("le chèque constaté apparaît dans le portefeuille « à encaisser » du Directeur Financier", async ({ page }) => {
  await login(page, "DIRFIN");
  await page.goto("/dashboard/finance");
  const aEncaisser = page.locator("section", { hasText: "Portefeuille chèques" });
  await expect(aEncaisser.getByText(REFERENCE)).toBeVisible();
  await expect(page.getByText(/1 chèque\(s\) à encaisser/)).toBeVisible();
});
