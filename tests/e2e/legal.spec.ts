import { expect, test } from "@playwright/test";
import { verifierA11y } from "./a11y";

/*
 * Pages légales publiques : accessibles sans connexion, bandeau « texte
 * provisoire » visible en tête, liées depuis le pied de page de /login,
 * structure factuelle (données réellement collectées), sans violation axe.
 */
const BANDEAU = "CONTENU À FAIRE VALIDER PAR UN JURISTE AVANT PUBLICATION — texte provisoire";

test("mentions légales et politique de confidentialité : sans session, bandeau provisoire, sections attendues", async ({ page }) => {
  await page.context().clearCookies();
  for (const [url, titre, sections] of [
    ["/mentions-legales", "Mentions légales", ["Éditeur du site", "Hébergement", "Cookies"]],
    ["/politique-confidentialite", "Politique de confidentialité", ["Données collectées", "Finalités et bases légales", "Durée de conservation", "Vos droits"]],
  ] as const) {
    const reponse = await page.goto(url);
    expect(reponse?.status()).toBe(200);
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId("bandeau-provisoire")).toHaveText(new RegExp(BANDEAU));
    await expect(page.getByRole("heading", { level: 1, name: titre })).toBeVisible();
    for (const s of sections) await expect(page.getByRole("heading", { level: 2, name: new RegExp(s) })).toBeVisible();
  }
  // Les données listées sont celles que l'application collecte réellement
  await expect(page.getByText(/pièce d'identité \(CIN ou passeport\)/)).toBeVisible();
  await expect(page.getByText(/preuve de paiement/)).toBeVisible();
  await expect(page.getByText(/suppression douce/)).toBeVisible();
  await expect(page.getByText(/promopro_session/).first()).toBeVisible();
});

test("le pied de page de /login mène aux deux pages, qui restent conformes axe", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");
  const pied = page.getByTestId("pied-login"); // <footer> imbriqué dans <main> : pas de rôle contentinfo
  await pied.getByRole("link", { name: "Mentions légales" }).click();
  await expect(page).toHaveURL(/\/mentions-legales$/);
  await verifierA11y(page, "/mentions-legales");
  await page.goto("/login");
  await pied.getByRole("link", { name: "Politique de confidentialité" }).click();
  await expect(page).toHaveURL(/\/politique-confidentialite$/);
  await verifierA11y(page, "/politique-confidentialite");
  await page.getByRole("link", { name: /retour à la connexion/ }).click();
  await expect(page).toHaveURL(/\/login$/);
});
