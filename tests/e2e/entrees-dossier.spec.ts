import { expect, test, type Page } from "@playwright/test";
import { deposerFichier, hrefBienStaff, login, SUFFIXE_RUN, ouvrirFicheClientDepuisListe } from "./helpers";
import { texteDuPdf } from "../pdf-texte";

/*
 * Entrées inhabituelles sur les nouveaux formulaires : éditeur de contrat
 * (HTML et script dans une section — texte affiché tel quel, jamais exécuté ;
 * section sans titre ; 50 sections dans un contrat) et éditeur d'échéancier
 * (0 tranche, 25 tranches, pourcentage à 3 décimales). Vente propre au spec,
 * nettoyée par désistement remboursé.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const D = { bien: `Appartement EN${SUFFIXE}`, clientNom: `Entree${SUFFIXE}`, bienHref: "", hrefFiche: "" };
const HTML = `<script>alert("xss")</script><b>gras</b> & "guillemets" <img src=x onerror=alert(1)>`;

async function editeur(page: Page) {
  await page.goto(`${D.hrefFiche}?onglet=contrat`);
  const e = page.locator('[data-testid="editeur-contrat"][data-hydrated="true"]');
  await expect(e).toBeVisible();
  return e;
}

test("mise en place : vente conclue", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(D.bien);
  await form.getByLabel(/Prix/).fill("450000");
  await form.getByLabel(/Surface/).fill("55");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: D.bien, exact: true })).toBeVisible();
  await login(page, "COM1");
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(D.clientNom);
  await page.getByLabel("Prénom").fill("Lina");
  await page.getByLabel("Téléphone 1").fill("06 77 00 00 14");
  await page.getByLabel("E-mail").fill(`entree.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByTestId("bloc-acces")).toBeVisible();
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
  await login(page, "RESPADM");
  await page.goto("/dashboard/clients");
  await ouvrirFicheClientDepuisListe(page, new RegExp(D.clientNom));
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
  D.hrefFiche = page.url().split("?")[0];
});

test("éditeur de contrat : HTML et script restent du texte (éditeur, PDF), section sans titre refusée, 50 sections acceptées et générées", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "RESPADM");
  let e = await editeur(page);
  const sections = e.getByTestId("section-contrat");
  const base = await sections.count();

  // HTML / script dans le texte d'une section : enregistré et réaffiché tel quel, jamais interprété
  await sections.first().getByLabel("Texte").fill(HTML);
  await e.getByTestId("enregistrer-sections").click();
  await expect(page.getByTestId("contrat-message")).toContainText("Sections enregistrées");
  e = await editeur(page);
  await expect(e.getByTestId("section-contrat").first().getByLabel("Texte")).toHaveValue(HTML);
  await expect(page.locator("script:not([src])").filter({ hasText: "alert" })).toHaveCount(0);
  await expect(page.locator("b", { hasText: "gras" })).toHaveCount(0);
  await e.getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText("version 1");
  const pdf = await page.getByTestId("lien-contrat-pdf").getAttribute("href");
  const texte = await texteDuPdf(await (await page.request.get(pdf!)).body());
  expect(texte).toContain("<script>");
  expect(texte).toContain("<b>gras</b>");

  // Section sans titre : refusée côté serveur (validation HTML5 retirée pour l'atteindre), rien n'est enregistré
  e = await editeur(page);
  await e.getByTestId("ajouter-section").click();
  const nouvelle = e.getByTestId("section-contrat").last();
  await nouvelle.getByLabel("Titre de la section").evaluate((el) => el.removeAttribute("required"));
  await nouvelle.getByLabel("Texte").fill("Section anonyme");
  await e.getByTestId("enregistrer-sections").click();
  await expect(e.getByText(new RegExp(`La section ${base + 1} n'a pas de titre`))).toBeVisible();
  e = await editeur(page);
  await expect(e.getByTestId("section-contrat")).toHaveCount(base);

  // 50 sections supplémentaires : enregistrées, rechargées, générées
  for (let i = 1; i <= 50; i++) {
    await e.getByTestId("ajouter-section").click();
    await e.getByTestId("section-contrat").last().getByLabel("Titre de la section").fill(`Section ${i}`);
  }
  await expect(e.getByTestId("section-contrat")).toHaveCount(base + 50);
  await e.getByTestId("enregistrer-sections").click();
  await expect(page.getByTestId("contrat-message")).toContainText("Sections enregistrées");
  e = await editeur(page);
  await expect(e.getByTestId("section-contrat")).toHaveCount(base + 50);
  await expect(e.getByTestId("section-contrat").last().getByLabel("Titre de la section")).toHaveValue("Section 50");
  await e.getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText("version 2");
  const pdf2 = await page.getByTestId("lien-contrat-pdf").getAttribute("href");
  const texte2 = await texteDuPdf(await (await page.request.get(pdf2!)).body());
  expect(texte2).toContain("SECTION 50");
});

test("éditeur d'échéancier : 0 tranche, 25 tranches et 3 décimales sont refusés sans rien écrire", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "COM1");
  await page.goto(`${D.hrefFiche}?onglet=paiements`);
  const ouvrir = async () => {
    await page.goto(`${D.hrefFiche}?onglet=paiements`);
    await page.getByTestId("modifier-echeancier").click();
    const form = page.getByTestId("form-echeancier");
    await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true));
    return form;
  };
  // 0 tranche : toutes les lignes retirées du DOM avant l'envoi
  let form = await ouvrir();
  await form.evaluate((f) => f.querySelectorAll('[data-testid="tranche-edition"]').forEach((el) => el.remove()));
  await form.getByTestId("enregistrer-echeancier").click();
  await expect(page.getByTestId("echeancier-erreur")).toHaveText("Renseignez au moins une tranche.");

  // 25 tranches : le bouton s'arrête à 24, une 25e est injectée dans le formulaire
  form = await ouvrir();
  const lignes = form.getByTestId("tranche-edition");
  while ((await lignes.count()) < 24) await form.getByTestId("ajouter-tranche").click();
  await expect(form.getByTestId("ajouter-tranche")).toBeDisabled();
  await form.evaluate((f) => {
    for (const [nom, valeur] of [
      ["trancheId", ""],
      ["tranchePourcentage", "1"],
      ["trancheDate", "2029-01-01"],
    ]) {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = nom;
      i.value = valeur;
      f.appendChild(i);
    }
  });
  await form.getByTestId("enregistrer-echeancier").click();
  await expect(page.getByTestId("echeancier-erreur")).toHaveText("Un échéancier ne peut pas dépasser 24 tranches.");

  // 3 décimales : refusées côté serveur
  form = await ouvrir();
  await form.locator("#edition-tranche1Pourcentage").fill("33.333");
  await form.locator("#edition-tranche2Pourcentage").fill("26.667");
  await form.getByTestId("enregistrer-echeancier").click();
  await expect(page.getByTestId("echeancier-erreur")).toHaveText("Les pourcentages ne peuvent pas avoir plus de 2 décimales.");

  // Rien n'a été écrit : quatre tranches inchangées
  await page.goto(`${D.hrefFiche}?onglet=paiements`);
  await expect(page.getByTestId("table-echeancier").locator("tbody tr")).toHaveCount(4);
  await expect(page.getByTestId("table-echeancier")).toContainText("Tranche 1 · 40%");
});

test("nettoyage : désistement traité jusqu'au remboursement", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(D.bienHref);
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-entrees.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  await page.locator("[data-card]", { hasText: D.bien }).getByTestId("lien-fiche-client").click();
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await dossier.getByLabel("Décharge").fill("Nettoyage du test des entrées");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
});
