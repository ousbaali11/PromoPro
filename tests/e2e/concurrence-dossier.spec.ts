import { expect, test, type Browser, type Page } from "@playwright/test";
import { COMPTES, choisirTranche, deposerFichier, hrefBienStaff, login, loginAvec, ymd, SUFFIXE_RUN, ouvrirFicheClientDepuisListe } from "./helpers";

/*
 * Concurrence sur l'échéancier flexible et le contrat par sections. Deux
 * navigateurs agissent au même instant sur le même dossier ; le champ caché
 * `_delaiTest` (ignoré en production) retient volontairement la première
 * requête dans la fenêtre « lu, pas encore écrit » pour que la seconde s'y
 * glisse à coup sûr. Invariants attendus quel que soit l'ordre d'exécution :
 * une tranche payée n'est jamais supprimée, le total reste 100 %, chaque
 * paiement validé vise une tranche existante, et deux générations de PDF
 * presque simultanées archivent chacune la version précédente sans en perdre.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const D = { bien: `Appartement CC${SUFFIXE}`, clientNom: `Concur${SUFFIXE}`, clientPrenom: "Yasmine", prix: 800000, bienHref: "", hrefFiche: "" };
const nomClient = () => `${D.clientPrenom} ${D.clientNom}`;

async function contexte(browser: Browser, compte: keyof typeof COMPTES) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await loginAvec(page, COMPTES[compte].identifiant, COMPTES[compte].mdp, COMPTES[compte].atterrissage);
  return { ctx, page };
}

/** Ajoute le champ caché `_delaiTest` au formulaire : la requête est retenue côté serveur après sa lecture initiale. */
async function retenir(form: ReturnType<Page["locator"]>, ms: number) {
  await form.evaluate((f, valeur) => {
    const i = document.createElement("input");
    i.type = "hidden";
    i.name = "_delaiTest";
    i.value = String(valeur);
    f.appendChild(i);
  }, ms);
}

/** Pourcentages et statuts lus dans le tableau de l'échéancier de la fiche client. */
async function lireEcheancier(page: Page) {
  await page.goto(`${D.hrefFiche}?onglet=paiements`);
  const lignes = page.getByTestId("table-echeancier").locator("tbody tr");
  await expect(lignes.first()).toBeVisible();
  return lignes.evaluateAll((trs) =>
    trs.map((tr) => {
      const texte = tr.textContent ?? "";
      const m = /Tranche (\d+) · ([\d.,]+)%/.exec(texte);
      return { numero: Number(m?.[1]), pourcentage: Number((m?.[2] ?? "0").replace(",", ".")), payee: /Payée|Partielle/.test(texte) };
    }),
  );
}

/** Formulaire du recouvrement prêt à valider un paiement sur la tranche donnée (montant = montant de la tranche). */
async function preparerEncaissement(page: Page, tranche: number, montant: number) {
  await page.goto("/dashboard/recouvrement");
  await page.getByRole("button", { name: `Ajouter un paiement pour ${nomClient()}` }).first().click();
  const form = page.locator("form", { has: page.locator('input[name="reference"]') }).first();
  await choisirTranche(form, tranche);
  await form.getByLabel("Banque").fill("Banque concurrence");
  await form.getByLabel("Date de l'opération").fill(ymd(new Date()));
  await form.getByLabel("Montant", { exact: true }).fill(String(montant));
  await form.getByLabel("Porteur de l'opération").fill(nomClient());
  await form.getByLabel("Référence de l'opération").fill(`REF-CC-${SUFFIXE}-T${tranche}`);
  await deposerFichier(form, "preuveUrl", [{ name: `preuve-t${tranche}.png` }]);
  return form;
}

test("mise en place : vente conclue (40/20/20/20) et contrat généré une première fois", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(D.bien);
  await form.getByLabel(/Prix/).fill(String(D.prix));
  await form.getByLabel(/Surface/).fill("80");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: D.bien, exact: true })).toBeVisible();

  await login(page, "COM1");
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(D.clientNom);
  await page.getByLabel("Prénom").fill(D.clientPrenom);
  await page.getByLabel("Téléphone 1").fill("06 77 00 00 11");
  await page.getByLabel("E-mail").fill(`concur.${SUFFIXE.toLowerCase()}@exemple.ma`);
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
  await page.goto(`${D.hrefFiche}?onglet=contrat`);
  await page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText("version 1");
});

test("retrait d'une tranche pendant qu'un paiement la solde : le retrait est refusé, la tranche payée subsiste, le total reste 100 %", async ({ browser }) => {
  test.setTimeout(300_000);
  const com = await contexte(browser, "COM1");
  const recouv = await contexte(browser, "RECOUV");
  // A : retire la tranche 4 et reporte ses 20 % sur la tranche 3 ; la requête sera retenue 2,5 s après lecture
  await com.page.goto(`${D.hrefFiche}?onglet=paiements`);
  await com.page.getByTestId("modifier-echeancier").click();
  const formA = com.page.getByTestId("form-echeancier");
  await formA.getByTestId("tranche-edition").last().getByTestId("retirer-tranche").click();
  await expect(formA.getByTestId("tranche-edition")).toHaveCount(3);
  await formA.locator("#edition-tranche3Pourcentage").fill("40");
  await expect(formA.getByTestId("total-pourcentages-edition")).toContainText("100");
  await retenir(formA, 2500);
  // B : encaisse la tranche 4 (20 % de 800 000)
  const formB = await preparerEncaissement(recouv.page, 4, D.prix * 0.2);

  await Promise.all([
    formA.getByTestId("enregistrer-echeancier").click(),
    (async () => {
      await recouv.page.waitForTimeout(600);
      await formB.getByRole("button", { name: "Enregistrer et valider" }).click();
    })(),
  ]);
  await expect(recouv.page.getByText(new RegExp(`Paiement enregistré et validé pour ${nomClient()}`))).toBeVisible();
  await expect(com.page.getByTestId("echeancier-erreur")).toContainText(/a déjà reçu un paiement|vient de recevoir un paiement/);

  const tranches = await lireEcheancier(com.page);
  expect(tranches.map((t) => t.numero)).toEqual([1, 2, 3, 4]);
  expect(tranches.reduce((s, t) => s + t.pourcentage, 0)).toBeCloseTo(100, 6);
  expect(tranches[3].payee).toBe(true);
  await com.ctx.close();
  await recouv.ctx.close();
});

test("ajout d'une tranche pendant qu'un paiement solde la tranche 2 : les deux aboutissent, cinq tranches, total 100 %, tranche 2 payée", async ({ browser }) => {
  test.setTimeout(300_000);
  const com = await contexte(browser, "COM1");
  const recouv = await contexte(browser, "RECOUV");
  await com.page.goto(`${D.hrefFiche}?onglet=paiements`);
  await com.page.getByTestId("modifier-echeancier").click();
  const formA = com.page.getByTestId("form-echeancier");
  await formA.getByTestId("ajouter-tranche").click();
  await expect(formA.getByTestId("tranche-edition")).toHaveCount(5);
  await formA.locator("#edition-tranche3Pourcentage").fill("10");
  await formA.locator("#edition-tranche5Pourcentage").fill("10");
  await formA.locator("#edition-tranche5Date").fill("2028-12-01");
  await expect(formA.getByTestId("total-pourcentages-edition")).toContainText("100");
  await retenir(formA, 2500);
  const formB = await preparerEncaissement(recouv.page, 2, D.prix * 0.2);

  await Promise.all([
    formA.getByTestId("enregistrer-echeancier").click(),
    (async () => {
      await recouv.page.waitForTimeout(600);
      await formB.getByRole("button", { name: "Enregistrer et valider" }).click();
    })(),
  ]);
  await expect(recouv.page.getByText(new RegExp(`Paiement enregistré et validé pour ${nomClient()}`))).toBeVisible();
  await expect(com.page.getByTestId("toast").filter({ hasText: "Échéancier enregistré" })).toBeVisible();

  const tranches = await lireEcheancier(com.page);
  expect(tranches.map((t) => t.numero)).toEqual([1, 2, 3, 4, 5]);
  expect(tranches.reduce((s, t) => s + t.pourcentage, 0)).toBeCloseTo(100, 6);
  expect(tranches[1].payee).toBe(true);
  expect(tranches[3].payee).toBe(true);
  await com.ctx.close();
  await recouv.ctx.close();
});

test("deux générations du PDF presque simultanées (deux onglets du Responsable Administratif) : versions distinctes, chacune archivée, aucune perdue", async ({ browser }) => {
  test.setTimeout(300_000);
  const un = await contexte(browser, "RESPADM");
  const deux = await contexte(browser, "RESPADM");
  for (const c of [un, deux]) {
    await c.page.goto(`${D.hrefFiche}?onglet=contrat`);
    await expect(c.page.locator('[data-testid="editeur-contrat"][data-hydrated="true"]')).toBeVisible();
  }
  const versionsAvant = await un.page.getByTestId("version-pdf").count();
  await retenir(un.page.getByTestId("editeur-contrat"), 1500);
  await Promise.all([
    un.page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click(),
    (async () => {
      await deux.page.waitForTimeout(500);
      await deux.page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click();
    })(),
  ]);
  const messages = await Promise.all(
    [un, deux].map(async (c) => {
      await expect(c.page.getByTestId("contrat-message")).toContainText(/PDF régénéré \(version \d+\)/);
      return (await c.page.getByTestId("contrat-message").textContent()) ?? "";
    }),
  );
  const versions = messages.map((m) => Number(/version (\d+)/.exec(m)?.[1])).sort();
  expect(versions).toEqual([versionsAvant + 2, versionsAvant + 3]);

  await un.page.reload();
  await expect(un.page.getByTestId("version-pdf")).toHaveCount(versionsAvant + 2);
  const courant = await un.page.getByTestId("lien-contrat-pdf").getAttribute("href");
  const archives = (await un.page.getByTestId("version-pdf").getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).filter((h): h is string => !!h);
  expect(new Set([courant, ...archives]).size).toBe(archives.length + 1);
  for (const url of [courant!, ...archives]) expect((await un.page.request.get(url)).status(), url).toBe(200);
  await un.ctx.close();
  await deux.ctx.close();
});

test("nettoyage : désistement traité jusqu'au remboursement", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(D.bienHref);
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-concurrence.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  await page.locator("[data-card]", { hasText: D.bien }).getByTestId("lien-fiche-client").click();
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await dossier.getByLabel("Décharge").fill("Nettoyage du test de concurrence");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
});
