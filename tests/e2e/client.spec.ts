import { expect, test } from "@playwright/test";
import { choisirTranche, deposerFichier, ligneTrancheClient, login, ouvrirBienClient, prochainJour, ymd } from "./helpers";

/**
 * Espace Client (sections 11.3, 11.5, 11.7, 11.8, 11.9) sur l'Appartement A01 :
 * rendez-vous avec reproposition du service, demande de visite et choix d'un
 * créneau validé, paiement déclaré par le client avec trop-perçu reporté,
 * demande de photos limitée à une fois par 6 mois.
 */
test.describe.configure({ mode: "serial" });

test("rendez-vous : proposition du client → reproposition du SAV → acceptation du client", async ({ page }) => {
  const lundi = ymd(prochainJour(1));
  const mardi = ymd(prochainJour(2));

  await login(page, "CLIENT");
  await page.goto("/client/rendez-vous");
  await page.locator('select[name="service"]').selectOption("SAV");
  await page.locator('input[name="date"]').fill(`${lundi}T10:00`);
  await page.locator('textarea[name="notes"]').fill("Point E2E livraison");
  await page.getByRole("button", { name: "Proposer ce rendez-vous" }).click();
  await expect(page.getByText(/Demande envoyée au service après-vente/)).toBeVisible();
  await expect(page.getByText("En attente du service")).toBeVisible();

  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  const sectionRdv = page.locator("section", { hasText: "Point E2E livraison" });
  await expect(sectionRdv.getByText("Proposé par le client")).toBeVisible();
  await sectionRdv.getByRole("button", { name: "Reproposer" }).click();
  await sectionRdv.locator('input[name="date"]').fill(`${mardi}T15:00`);
  await sectionRdv.locator('input[name="notes"]').fill("Lundi matin indisponible");
  await sectionRdv.getByRole("button", { name: "Envoyer" }).click();
  // Le message du service remplace celui du client sur la ligne
  await expect(page.locator("section", { hasText: "Lundi matin indisponible" }).getByText("En attente du client")).toBeVisible();

  await login(page, "CLIENT");
  await page.goto("/client/rendez-vous");
  await expect(page.getByText("Nouvelle proposition — à votre réponse")).toBeVisible();
  await expect(page.getByText("Lundi matin indisponible")).toBeVisible();
  await page.getByRole("button", { name: "Accepter" }).click();
  await expect(page.getByText("Confirmé", { exact: true })).toBeVisible();

  // Côté SAV, le rendez-vous est passé dans les confirmés
  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  await expect(page.locator("section", { hasText: "Lundi matin indisponible" }).getByText("Confirmé", { exact: true })).toBeVisible();
});

test("visite : demande du client → acceptation du SAV → créneau validé (dimanche refusé, lundi 10h accepté)", async ({ page }) => {
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await page.getByRole("button", { name: "Demander une visite" }).click();
  await expect(page.getByText("Demande de visite en attente du SAV")).toBeVisible();

  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  const sectionVisites = page.locator("section", { hasText: "Demandes de visite" });
  await sectionVisites.getByRole("button", { name: "Accepter" }).click();
  await expect(sectionVisites.getByText("Acceptée — créneau à choisir par le client")).toBeVisible();
  await expect(sectionVisites.getByRole("link", { name: "Autorisation" })).toBeVisible();

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await expect(page.getByText("Visite acceptée — choisissez votre créneau")).toBeVisible();

  // Le champ date est contrôlé par React : on attend l'hydratation du formulaire avant de saisir
  await page.locator('[data-testid="form-creneau"][data-hydrated="true"]').waitFor();

  // Dimanche : aucun créneau proposé, bouton désactivé
  await page.locator("#visite-date").fill(ymd(prochainJour(0)));
  await expect(page.locator("#visite-heure option")).toHaveText(["Pas de visite ce jour"]);
  await expect(page.getByRole("button", { name: "Confirmer le créneau" })).toBeDisabled();

  // Lundi 10h00 : créneau valide
  await page.locator("#visite-date").fill(ymd(prochainJour(1)));
  await page.locator("#visite-heure").selectOption("10:00");
  await page.getByRole("button", { name: "Confirmer le créneau" }).click();
  await expect(page.getByText(/Visite le lundi .* 10:00/)).toBeVisible();
  const href = await page.getByRole("link", { name: "Autorisation de visite" }).getAttribute("href");
  const reponse = await page.request.get(href!);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toContain("application/pdf");
});

test("paiement déclaré par le client avec trop-perçu : validé par le comptable, excédent reporté sur la tranche suivante", async ({ page }) => {
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await page.getByRole("button", { name: "Ajouter un paiement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
  await choisirTranche(form, 3);
  await form.getByLabel("Banque").fill("CIH Bank");
  await form.getByLabel("Date de l'opération").fill(ymd(new Date()));
  await form.getByLabel("Montant", { exact: true }).fill("200000"); // tranche 3 = 170 000 → 30 000 de trop-perçu
  await form.getByLabel("Porteur de l'opération").fill("Hamid Naciri");
  await deposerFichier(form, "preuveUrl", [{ name: "preuve-client.png" }]);
  await form.getByRole("button", { name: "Déclarer ce paiement" }).click();
  await expect(page.getByText(/Paiement déclaré/)).toBeVisible();
  await expect(page.locator("li", { hasText: "200 000 MAD" }).getByText("En vérification")).toBeVisible();

  await login(page, "COMPTA");
  await page.goto("/dashboard/paiements");
  const carteIndex = page.locator("[data-card]", { hasText: "Appartement A01" }).filter({ hasText: "Tranche 3" });
  await expect(carteIndex).toHaveCount(1);
  await expect(carteIndex.getByText("saisi par Client")).toBeVisible();
  await carteIndex.getByTestId("lien-fiche-client").click(); // validation sur la fiche du client, un paiement à la fois
  const carte = page.getByTestId("onglet-paiements").locator("[data-card]", { hasText: "Tranche 3" }).filter({ has: page.getByTestId("form-completer") });
  await carte.getByLabel("Référence").fill("VIR-E2E-T3-0002");
  await carte.getByLabel("Date de réception").fill(ymd(new Date()));
  await carte.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByTestId("ligne-paiement").filter({ hasText: "VIR-E2E-T3-0002" })).toHaveCount(1);
  await page.goto("/dashboard/paiements");
  await expect(page.locator("table tbody tr", { hasText: "VIR-E2E-T3-0002" })).toHaveCount(1);

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await expect(ligneTrancheClient(page, 3).getByText("Payée")).toBeVisible();
  const t4 = ligneTrancheClient(page, 4);
  await expect(t4.getByText("Partielle")).toBeVisible();
  await expect(t4.getByText(/reste 140.000 MAD/)).toBeVisible();
  await expect(page.locator("li", { hasText: "VIR-E2E-T3-0002" }).getByRole("link", { name: "Reçu PDF" })).toBeVisible();
});

test("photos d'avancement : une demande par 6 mois, dépôt multiple par le SAV, galerie côté client", async ({ page }) => {
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const bouton = page.getByRole("button", { name: "Demander des photos" });
  await expect(bouton).toBeEnabled();
  await bouton.click();
  await expect(page.getByText("Demande transmise au SAV")).toBeVisible();
  await expect(bouton).toBeDisabled();
  await expect(page.getByText(/Prochaine demande possible le .* dans \d+ j/)).toBeVisible();

  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  const sectionPhotos = page.locator("section", { hasText: "Demandes de photos" });
  await sectionPhotos.getByRole("button", { name: "Déposer des photos" }).click();
  const form = sectionPhotos.locator("form", { has: page.locator('input[type="file"][multiple]') });
  await deposerFichier(form, "photos", [{ name: "chantier-1.png" }, { name: "chantier-2.png" }]);
  await form.getByPlaceholder(/Légende/).fill("Gros œuvre terminé");
  await form.getByRole("button", { name: "Publier pour le client" }).click();
  await expect(sectionPhotos.getByText("Traitée")).toBeVisible();
  await expect(sectionPhotos.getByText(/2 photo\(s\) déposée\(s\)/)).toBeVisible();

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const photos = page.locator('a[href^="/api/files/photos-avancement/"]');
  await expect(photos).toHaveCount(2);
  await expect(page.getByText(/Gros œuvre terminé/)).toBeVisible();
  for (const href of await photos.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!))) {
    expect((await page.request.get(href)).status()).toBe(200);
  }
  await expect(page.getByRole("button", { name: "Demander des photos" })).toBeDisabled();
});
