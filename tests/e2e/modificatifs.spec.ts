import { expect, test } from "@playwright/test";
import { login, ouvrirBienClient, deposerFichier } from "./helpers";

/*
 * Travaux Modificatifs Acquéreurs : demande du client → chiffrage et devis par
 * le SAV → acceptation horodatée par le client → suivi des travaux, avec les
 * notifications à chaque étape. Puis la fenêtre de dépôt (délai du projet).
 *
 * Joue sur l'Appartement A01 (vendu à Hamid Naciri), avant sa livraison par
 * la spec SAV ; la demande laissée « terminée » n'interfère avec aucune autre spec.
 */

const DESCRIPTION = "Déplacer la cloison entre la cuisine et le séjour (E2E)";
const MONTANT = "15000";

test("demande → devis → acceptation → travaux, statut et notifications à chaque étape", async ({ page }) => {
  // 1) Le client demande une modification
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const section = page.getByTestId("section-tma");
  await section.getByRole("button", { name: "Demander une modification" }).click();
  await section.getByLabel("Modification souhaitée").fill(DESCRIPTION);
  await section.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(section.getByTestId("tma-succes")).toContainText("Demande envoyée");
  const demande = section.getByTestId("demande-tma").filter({ hasText: DESCRIPTION });
  await expect(demande).toHaveAttribute("data-statut-tma", "DEMANDE");
  await expect(demande.getByText("Demande envoyée")).toBeVisible();

  // 2) Le SAV est notifié, chiffre et joint le devis
  await login(page, "SAV");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Nouvelle demande de modification").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/dashboard/sav");
  const sectionSav = page.locator("section", { hasText: "Travaux modificatifs" });
  const carteIndex = sectionSav.getByTestId("tma-carte").filter({ hasText: DESCRIPTION });
  await expect(carteIndex).toHaveCount(1);
  await expect(carteIndex.getByText("Hamid Naciri")).toBeVisible();
  await expect(carteIndex.getByTestId("tma-chiffrer")).toHaveCount(0); // index sans action
  await carteIndex.getByTestId("lien-fiche-client").click();
  await expect(page).toHaveURL(/onglet=tma/);
  const carte = page.getByTestId("onglet-tma").getByTestId("tma-carte").filter({ hasText: DESCRIPTION });
  await carte.getByTestId("tma-chiffrer").click();
  const form = carte.getByTestId("form-chiffrage");
  await form.getByLabel("Montant du devis (MAD)").fill(MONTANT);
  await deposerFichier(form, "devisUrl", [{ name: "devis.pdf" }]);
  await form.getByRole("button", { name: "Envoyer le devis au client" }).click();
  // La page se ré-affiche avec la demande chiffrée (formulaire de chiffrage retiré, devis et montant visibles)
  await expect(carte).toHaveAttribute("data-statut-tma", "CHIFFRE");
  await expect(carte.getByText("15 000 MAD")).toBeVisible();
  await expect(carte.getByRole("link", { name: "Devis" })).toBeVisible();

  // 3) Le client est notifié, voit le devis et l'accepte (case horodatée)
  await login(page, "CLIENT");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Devis de modification disponible").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await ouvrirBienClient(page, "Appartement A01");
  const demandeChiffree = page.getByTestId("demande-tma").filter({ hasText: DESCRIPTION });
  await expect(demandeChiffree).toHaveAttribute("data-statut-tma", "CHIFFRE");
  await expect(demandeChiffree.getByText(/15.000 MAD/).first()).toBeVisible(); // badge + case d'acceptation
  await expect(demandeChiffree.getByRole("link", { name: "Devis PDF" })).toBeVisible();
  const acceptation = demandeChiffree.getByTestId("form-acceptation-devis");
  await acceptation.getByRole("checkbox").check();
  await acceptation.getByRole("button", { name: "Accepter le devis" }).click();
  await expect(demandeChiffree).toHaveAttribute("data-statut-tma", "SIGNE");
  await expect(demandeChiffree.getByText(/devis accepté le/)).toBeVisible();

  // 4) L'émetteur du devis est notifié et fait avancer les travaux
  await login(page, "SAV");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Devis de modification accepté").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/dashboard/sav");
  const carteSignee = page.getByTestId("tma-carte").filter({ hasText: DESCRIPTION });
  await expect(carteSignee).toHaveAttribute("data-statut-tma", "SIGNE");
  await expect(carteSignee.getByText(/accepté le/)).toBeVisible();
  await carteSignee.getByTestId("lien-fiche-client").click();
  const carteFiche = page.getByTestId("onglet-tma").getByTestId("tma-carte").filter({ hasText: DESCRIPTION });
  await carteFiche.getByTestId("tma-avancer").click();
  await expect(carteFiche).toHaveAttribute("data-statut-tma", "EN_COURS");
  await carteFiche.getByTestId("tma-avancer").click();
  await expect(carteFiche).toHaveAttribute("data-statut-tma", "TERMINE");

  await login(page, "CLIENT");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Travaux modificatifs terminés").first()).toBeVisible();
});

const formatDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d);

async function reglerDelaiTma(page: import("@playwright/test").Page, valeur: string) {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await page.getByTestId("modifier-projet").click();
  await expect(page).toHaveURL(/\/modifier$/);
  const champ = page.getByLabel("Délai des travaux modificatifs (jours après blocage)");
  const avant = await champ.inputValue();
  await champ.fill(valeur);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);
  await expect(page.getByText(new RegExp(`TMA : ${valeur} j après blocage`))).toBeVisible();
  return avant;
}

test("fenêtre de dépôt : la date limite suit le délai configuré par projet ; 0 ou négatif refusés", async ({ page }) => {
  // Le bien A01 est bloqué le jour du seed (aujourd'hui) : limite = aujourd'hui + délai, fin de journée.
  const aujourdhui = new Date();

  // Un délai nul ou négatif est refusé avec un message clair (le projet garde sa valeur)
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await page.getByTestId("modifier-projet").click();
  await expect(page).toHaveURL(/\/modifier$/);
  for (const valeur of ["0", "-5"]) {
    await page.getByLabel("Délai des travaux modificatifs (jours après blocage)").fill(valeur);
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page.getByText("Le délai des travaux modificatifs doit être d'au moins 1 jour.")).toBeVisible();
  }

  const initial = await reglerDelaiTma(page, "1");
  expect(Number(initial)).toBeGreaterThan(0);

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const demain = new Date(aujourdhui);
  demain.setDate(demain.getDate() + 1);
  await expect(page.getByTestId("tma-limite")).toHaveText(formatDate(demain));
  await expect(page.getByRole("button", { name: "Demander une modification" })).toBeVisible();

  await reglerDelaiTma(page, initial);
  const attendue = new Date(aujourdhui);
  attendue.setDate(attendue.getDate() + Number(initial));
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await expect(page.getByTestId("tma-limite")).toHaveText(formatDate(attendue));
});
