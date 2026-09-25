import { expect, test, type Browser, type Page } from "@playwright/test";
import { COMPTES, confirmer, deposerFichier, hrefBienStaff, login, loginAvec, SUFFIXE_RUN, ouvrirFicheClientDepuisListe } from "./helpers";

/*
 * Cycle suppression douce / recréation d'un contrat pour le même couple
 * bien-client : jamais deux contrats actifs à la fois, l'historique des PDF
 * reste rattaché au contrat supprimé (le nouveau repart sans version), une
 * création depuis un onglet obsolète ou deux créations simultanées sont
 * refusées proprement.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const D = { bien: `Appartement CY${SUFFIXE}`, clientNom: `Cycle${SUFFIXE}`, bienHref: "", hrefFiche: "", contrat1: "", pdf1: "", archive1: "" };

async function contexte(browser: Browser, compte: keyof typeof COMPTES) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await loginAvec(page, COMPTES[compte].identifiant, COMPTES[compte].mdp, COMPTES[compte].atterrissage);
  return { ctx, page };
}

async function ongletContrat(page: Page) {
  await page.goto(`${D.hrefFiche}?onglet=contrat`);
  await expect(page.getByTestId("onglet-contrat")).toBeVisible();
  // L'éditeur n'est présent qu'avec un contrat actif ; s'il l'est, on attend son hydratation avant d'agir
  if ((await page.getByTestId("editeur-contrat").count()) > 0) await page.locator('[data-testid="editeur-contrat"][data-hydrated="true"]').waitFor();
}

/** Nombre de contrats (toutes lignes) du bien dans l'index Contrats : un seul actif attendu. */
async function lignesIndex(page: Page) {
  await page.goto("/dashboard/contrats");
  return page.getByTestId("contrat-ligne").filter({ hasText: D.bien }).count();
}

test("mise en place : vente conclue, contrat généré deux fois (une version archivée)", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(D.bien);
  await form.getByLabel(/Prix/).fill("550000");
  await form.getByLabel(/Surface/).fill("66");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: D.bien, exact: true })).toBeVisible();

  await login(page, "COM1");
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(D.clientNom);
  await page.getByLabel("Prénom").fill("Sara");
  await page.getByLabel("Téléphone 1").fill("06 77 00 00 12");
  await page.getByLabel("E-mail").fill(`cycle.${SUFFIXE.toLowerCase()}@exemple.ma`);
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
  await ongletContrat(page);
  D.contrat1 = (await page.getByTestId("carte-contrat").getAttribute("data-contrat-id"))!;
  await page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText("version 1");
  await page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText("version 2");
  await expect(page.getByTestId("version-pdf")).toHaveCount(1);
  D.pdf1 = (await page.getByTestId("lien-contrat-pdf").getAttribute("href"))!;
  D.archive1 = (await page.getByTestId("version-pdf").first().getByRole("link").getAttribute("href"))!;
  expect(await lignesIndex(page)).toBe(1);
});

test("suppression douce puis recréation immédiate : un seul contrat actif, l'historique reste rattaché à l'ancien, le nouveau repart sans version", async ({ page }) => {
  await login(page, "RESPADM");
  await ongletContrat(page);
  await confirmer(page, "supprimer-contrat", page.getByTestId("editeur-contrat"));
  await expect(page.getByTestId("toast").filter({ hasText: "Contrat supprimé" })).toBeVisible();
  await expect(page.getByTestId("carte-sans-contrat")).toBeVisible();
  await page.getByTestId("creer-contrat").click();
  await expect(page.getByTestId("carte-contrat")).toBeVisible();
  const contrat2 = (await page.getByTestId("carte-contrat").getAttribute("data-contrat-id"))!;
  expect(contrat2).not.toBe(D.contrat1);
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "EN_ATTENTE");
  await expect(page.getByTestId("carte-contrat")).toHaveCount(1);
  await expect(page.getByTestId("lien-contrat-pdf")).toHaveCount(0);
  await expect(page.getByTestId("version-pdf")).toHaveCount(0);
  // L'ancien contrat, supprimé, garde son PDF courant et sa version archivée
  const ancien = page.getByTestId("section-contrats-supprimes").getByTestId("contrat-supprime");
  await expect(ancien).toHaveCount(1);
  await expect(ancien).toContainText("1 version(s) archivée(s)");
  const liens = await ancien.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(liens).toContain(D.pdf1);
  expect(liens).toContain(D.archive1);
  expect(await lignesIndex(page)).toBe(1);
});

test("deuxième contrat actif refusé : depuis un onglet obsolète (création après création), puis deux créations simultanées", async ({ browser }) => {
  test.setTimeout(300_000);
  const un = await contexte(browser, "RESPADM");
  const deux = await contexte(browser, "RESPADM");
  // Onglet obsolète : les deux onglets voient « Créer un nouveau contrat » après la suppression ; le second clique après le premier
  await ongletContrat(un.page);
  await confirmer(un.page, "supprimer-contrat", un.page.getByTestId("editeur-contrat"));
  await expect(un.page.getByTestId("creer-contrat")).toBeVisible();
  await ongletContrat(deux.page);
  await expect(deux.page.getByTestId("creer-contrat")).toBeVisible();
  await un.page.getByTestId("creer-contrat").click();
  await expect(un.page.getByTestId("carte-contrat")).toBeVisible();
  await deux.page.getByTestId("creer-contrat").click();
  await expect(deux.page.getByText("Un contrat actif existe déjà pour ce bien.")).toBeVisible();
  expect(await lignesIndex(un.page)).toBe(1);

  // Créations simultanées : exactement une réussit
  await ongletContrat(un.page);
  await confirmer(un.page, "supprimer-contrat", un.page.getByTestId("editeur-contrat"));
  await expect(un.page.getByTestId("creer-contrat")).toBeVisible();
  await ongletContrat(deux.page);
  await expect(deux.page.getByTestId("creer-contrat")).toBeVisible();
  await Promise.all([un.page.getByTestId("creer-contrat").click(), deux.page.getByTestId("creer-contrat").click()]);
  const resultats = await Promise.all(
    [un, deux].map(async (c) => {
      await expect(c.page.getByTestId("carte-contrat").or(c.page.getByText("Un contrat actif existe déjà pour ce bien."))).toBeVisible();
      return (await c.page.getByTestId("carte-contrat").count()) === 1 ? "cree" : "refuse";
    }),
  );
  expect(resultats.sort()).toEqual(["cree", "refuse"]);
  expect(await lignesIndex(un.page)).toBe(1);
  await ongletContrat(un.page);
  await expect(un.page.getByTestId("carte-contrat")).toHaveCount(1);
  await expect(un.page.getByTestId("section-contrats-supprimes").getByTestId("contrat-supprime")).toHaveCount(3);
  await un.ctx.close();
  await deux.ctx.close();
});

test("nettoyage : désistement traité jusqu'au remboursement", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(D.bienHref);
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-cycle.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  await page.locator("[data-card]", { hasText: D.bien }).getByTestId("lien-fiche-client").click();
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await dossier.getByLabel("Décharge").fill("Nettoyage du test de cycle");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
});
