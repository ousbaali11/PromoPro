import { expect, test } from "@playwright/test";
import { deposerFichier, login, ouvrirBienClient, ymd } from "./helpers";

/**
 * Service Après-Vente (section 12) sur l'Appartement A01 :
 * double confirmation de livraison (client + SAV) → « Livré » → dossier
 * transmis au notaire par le Responsable Administratif ; syndic défini par le
 * SAV → payé par le client avec preuve → validé par le Comptable Interne.
 */
test.describe.configure({ mode: "serial" });

test("livraison : confirmation du client puis du SAV → bien « Livré »", async ({ page }) => {
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await page.getByRole("button", { name: /Confirmer tout/ }).click();
  await expect(page.getByText("Votre confirmation est enregistrée")).toBeVisible();

  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  const ligne = page.locator("section", { hasText: "Livraisons" }).locator("div.divide-y > div", { hasText: "Appartement A01" });
  await expect(ligne.getByText("Client ✓")).toBeVisible();
  await expect(ligne.getByText("SAV —")).toBeVisible();
  await ligne.getByRole("button", { name: /Confirmer tout/ }).click();
  await expect(ligne.getByText("Livré", { exact: true })).toBeVisible();
  await expect(ligne.getByText("SAV ✓")).toBeVisible();

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await expect(page.getByText(/Bien livré le/)).toBeVisible();
  await expect(page.getByText("Livré", { exact: true })).toBeVisible();
});

test("le Responsable Administratif transmet le dossier du bien livré au notaire", async ({ page }) => {
  await login(page, "RESPADM");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Dossier à transmettre au notaire").first()).toBeVisible();

  await page.goto("/dashboard/contrats");
  const ligne = page.locator("section", { hasText: "Biens livrés" }).locator("div.divide-y > div", { hasText: "Appartement A01" });
  await expect(ligne.getByText(/livré le/)).toBeVisible();
  await ligne.getByRole("button", { name: "Dossier transmis au notaire" }).click();
  await expect(ligne.getByText(/Transmis au notaire le/)).toBeVisible();
});

test("syndic : défini par le SAV → payé par le client → validé par le comptable → SAV informé", async ({ page }) => {
  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  const select = page.locator("#syndic-bien");
  const valeur = await select.evaluate((el) => {
    const opt = [...(el as HTMLSelectElement).options].find((o) => o.textContent?.startsWith("Appartement A01"));
    return opt?.value ?? "";
  });
  expect(valeur).not.toBe("");
  await select.selectOption(valeur);
  await page.locator("#syndic-montant").fill("12000");
  await page.getByRole("button", { name: "Définir et notifier le client" }).click();
  await expect(page.getByText("Montant enregistré, client notifié.")).toBeVisible();
  const ligneSav = page.locator("table tbody tr", { hasText: "Appartement A01" }).filter({ hasText: /12.000 MAD/ });
  await expect(ligneSav.getByText("À payer")).toBeVisible();

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const carte = page.locator("div.rounded-xl", { hasText: "Syndic" }).filter({ hasText: /12.000 MAD/ });
  await expect(carte.getByText("À payer")).toBeVisible();
  await carte.getByRole("button", { name: "Déclarer mon paiement" }).click();
  await carte.locator("#syndic-banque").fill("CIH Bank");
  await carte.locator("#syndic-date").fill(ymd(new Date()));
  await carte.locator("#syndic-porteur").fill("Hamid Naciri");
  await deposerFichier(carte, "preuveUrl", [{ name: "preuve-syndic.png" }]);
  await carte.getByRole("button", { name: "Envoyer au service comptable" }).click();
  await expect(carte.getByText("En cours de validation")).toBeVisible();

  await login(page, "COMPTA");
  await page.goto("/dashboard/paiements");
  const section = page.locator("section", { hasText: "Syndic en attente de validation" });
  await expect(section.getByText(/12.000 MAD/)).toBeVisible();
  await section.getByRole("button", { name: "Valider le syndic" }).click();
  await expect(section.getByText("Aucun paiement de syndic à valider")).toBeVisible();

  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  await expect(ligneSav.getByText("Payé", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Syndic réglé").first()).toBeVisible();

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await expect(page.locator("div.rounded-xl", { hasText: "Syndic" }).filter({ hasText: /12.000 MAD/ }).getByText("Payé", { exact: true })).toBeVisible();
});
