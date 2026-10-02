import { expect, test } from "@playwright/test";
import { deposerFichier, lireUrl, login, ouvrirBienClient, ouvrirFicheClientDepuisListe, texteDuPdf, ymd } from "./helpers";

/*
 * Frais de dossier, sur le modèle du syndic : le Comptable Interne définit
 * (puis modifie) le montant depuis la fiche client, onglet Échéancier &
 * Paiements ; le client est notifié, le voit dans son espace et déclare son
 * paiement avec preuve ; le Comptable Interne le retrouve dans sa liste
 * d'attente (section distincte), valide depuis la fiche, un reçu PDF est
 * généré et le client notifié. Bien du seed : Appartement A01, vendu à Hamid
 * Naciri (le syndic de sav.spec vit dans sa propre table, sans interférence).
 */
test.describe.configure({ mode: "serial" });

const FICHE = { href: "" };

async function ongletPaiementsA01(page: import("@playwright/test").Page) {
  if (!FICHE.href) {
    await page.goto("/dashboard/clients");
    await ouvrirFicheClientDepuisListe(page, /Naciri/);
    FICHE.href = page.url().split("?")[0];
  }
  // Appartement A01 est le bien du client dans le seed : l'onglet s'ouvre dessus par l'URL
  await page.goto(`${FICHE.href}?onglet=paiements`);
  await expect(page.getByTestId("onglet-paiements")).toBeVisible();
}

test("définition puis modification par le Comptable Interne : le client est notifié à chaque fois et voit le montant « À payer »", async ({ page }) => {
  await login(page, "COMPTA");
  await ongletPaiementsA01(page);
  const section = page.getByTestId("section-frais-dossier");
  await expect(section).toBeVisible();
  await page.locator('[data-testid="form-frais-dossier"][data-hydrated="true"]').waitFor();
  await page.locator("#frais-dossier-montant").fill("2500");
  await page.getByTestId("definir-frais-dossier").click();
  await expect(page.getByTestId("frais-dossier-enregistre")).toContainText("Montant enregistré, client notifié.");
  const ligne = section.getByTestId("frais-dossier-ligne");
  await expect(ligne).toHaveCount(1);
  await expect(ligne).toHaveAttribute("data-statut", "A_PAYER");
  await expect(ligne).toContainText(/2.500 MAD/);

  // Modification tant que rien n'est payé
  await page.locator("#frais-dossier-montant").fill("3000");
  await page.getByTestId("definir-frais-dossier").click();
  await expect(page.getByTestId("frais-dossier-enregistre")).toContainText("Montant modifié, client notifié.");
  await expect(section.getByTestId("frais-dossier-ligne")).toContainText(/3.000 MAD/);

  // Le journal d'activité est consulté par le PDG (la page n'est pas dans le périmètre du Comptable Interne)
  await login(page, "PDG");
  await page.goto("/dashboard/journal?periode=jour");
  await expect(page.getByTestId("journal-ligne").filter({ hasText: /Frais de dossier définis : 2.500 MAD/ })).toHaveCount(1);
  await expect(page.getByTestId("journal-ligne").filter({ hasText: /2.500 MAD → 3.000 MAD/ })).toHaveCount(1);

  await login(page, "CLIENT");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Frais de dossier à régler").first()).toBeVisible();
  await expect(page.getByText("Montant des frais de dossier modifié").first()).toBeVisible();
  await ouvrirBienClient(page, "Appartement A01");
  const carte = page.getByTestId("carte-frais-dossier");
  await expect(carte.getByTestId("frais-dossier-montant")).toHaveText(/3.000 MAD/);
  await expect(carte.getByText("À payer")).toBeVisible();
});

test("le client déclare son paiement avec preuve ; le Comptable Interne le voit dans une section distincte de sa liste d'attente, valide depuis la fiche, un reçu est généré et le client notifié", async ({ page }) => {
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const carte = page.getByTestId("carte-frais-dossier");
  await carte.getByRole("button", { name: "Déclarer mon paiement" }).click();
  await carte.locator("#frais-banque").fill("CIH Bank");
  await carte.locator("#frais-date").fill(ymd(new Date()));
  await carte.locator("#frais-porteur").fill("Hamid Naciri");
  await deposerFichier(carte, "preuveUrl", [{ name: "preuve-frais.png" }]);
  await carte.getByRole("button", { name: "Envoyer au service comptable" }).click();
  await expect(carte.getByText("En cours de validation")).toBeVisible();

  await login(page, "COMPTA");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Paiement de frais de dossier à valider").first()).toBeVisible();
  await page.goto("/dashboard/paiements");
  const section = page.getByTestId("section-frais-dossier");
  await expect(section.getByTestId("frais-dossier-attente")).toHaveCount(1);
  await expect(section).toContainText(/3.000 MAD/);
  await expect(section).toContainText("CIH Bank");
  await expect(section.getByTestId("valider-frais-dossier")).toHaveCount(0); // index sans action
  await expect(page.getByTestId("section-syndic")).toBeVisible(); // la section Syndic reste distincte
  await section.getByTestId("lien-fiche-client").click();
  await expect(page).toHaveURL(/onglet=paiements/);
  const ligne = page.getByTestId("section-frais-dossier").getByTestId("frais-dossier-ligne");
  await expect(ligne).toHaveAttribute("data-statut", "EN_ATTENTE_VALIDATION");
  await expect(page.getByTestId("form-frais-dossier")).toHaveCount(0); // plus modifiable une fois le paiement déclaré
  await ligne.getByTestId("valider-frais-dossier").click();
  await expect(ligne).toHaveAttribute("data-statut", "PAYE");
  const recu = ligne.getByTestId("recu-frais-dossier");
  await expect(recu).toBeVisible();
  const hrefRecu = (await recu.getAttribute("href"))!;
  expect(hrefRecu).toMatch(/^\/api\/files\/recus\/[0-9a-f-]+\.pdf$/);
  const reponse = await lireUrl(page, hrefRecu);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toBe("application/pdf");
  const texte = texteDuPdf(await reponse.body());
  expect(texte).toContain("Frais de dossier");
  expect(texte).toContain("FRAIS-");

  await page.goto("/dashboard/paiements");
  await expect(page.getByTestId("section-frais-dossier").getByTestId("frais-dossier-attente")).toHaveCount(0);
  await login(page, "PDG");
  await page.goto("/dashboard/journal?periode=jour");
  await expect(page.getByTestId("journal-ligne").filter({ hasText: /Paiement des frais de dossier validé \(3.000 MAD\), reçu généré/ })).toHaveCount(1);
  await expect(page.getByTestId("journal-ligne").filter({ hasText: /reçu généré/ })).toContainText("Salma Lahlou");

  await login(page, "CLIENT");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Paiement des frais de dossier validé").first()).toBeVisible();
  await ouvrirBienClient(page, "Appartement A01");
  const carteClient = page.getByTestId("carte-frais-dossier");
  await expect(carteClient.getByText("Payé", { exact: true })).toBeVisible();
  await expect(carteClient.getByTestId("recu-frais-dossier")).toHaveAttribute("href", hrefRecu);
  expect((await lireUrl(page, hrefRecu)).status()).toBe(200);
  // Le reçu figure aussi dans l'onglet Documents de la fiche
  await login(page, "COMPTA");
  await page.goto(`${FICHE.href}?onglet=documents`);
  await expect(page.getByTestId("groupe-documents").filter({ hasText: "Frais de dossier" })).toContainText("Reçu des frais de dossier");
});

test("un autre rôle ne peut ni définir ni valider des frais de dossier", async ({ page }) => {
  await login(page, "SAV");
  await ongletPaiementsA01(page);
  await expect(page.getByTestId("form-frais-dossier")).toHaveCount(0);
  await expect(page.getByTestId("valider-frais-dossier")).toHaveCount(0);
});
