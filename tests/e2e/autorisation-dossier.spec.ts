import { expect, test, type Page } from "@playwright/test";
import { deposerFichier, forgerArgumentAction, hrefBienStaff, login, loginAvec } from "./helpers";

/*
 * Autorisation fine à l'intérieur d'un même promoteur, sur le territoire de
 * la restructuration. Règle unique du pôle commercial (peutConsulterDossierClient,
 * alignée sur les actions) : un Commercial ne consulte et ne modifie que ses
 * dossiers (clients suivis, biens vendus par lui) ; le Responsable Commercial
 * supervise tout le pôle. Le contrat (édition, génération, suppression douce,
 * restauration, création) n'appartient qu'au Responsable Administratif : les
 * autres rôles le lisent sans jamais voir ni pouvoir déclencher l'éditeur.
 * Vente de test : un bien vendu par COM2 à un client de COM2, nettoyé par
 * désistement remboursé.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = Date.now().toString(36).toUpperCase().slice(-4);
const V = { bien: `Appartement AUT${SUFFIXE}`, clientNom: `Zerouali${SUFFIXE}`, bienId: "", bienHref: "", hrefFiche: "" };
const RC = { identifiant: "", mdp: "" };
const NACIRI = { hrefFiche: "", bienId: "" };

async function lireAcces(bloc: ReturnType<Page["getByTestId"]>) {
  const dd = bloc.locator("dd");
  return { identifiant: (await dd.nth(0).innerText()).trim(), mdp: (await dd.nth(1).innerText()).trim() };
}

async function ficheDepuisListe(page: Page, nom: string) {
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: new RegExp(nom) }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
  return page.url().split("?")[0];
}

test("mise en place : Responsable Commercial recruté, vente conclue par COM2 pour son client", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(V.bien);
  await form.getByLabel(/Prix/).fill("700000");
  await form.getByLabel(/Surface/).fill("75");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: V.bien, exact: true })).toBeVisible();
  await page.goto("/dashboard/equipe");
  await page.locator('form[data-hydrated="true"]').first().waitFor();
  await page.getByLabel("Nom", { exact: true }).fill(`Superviseur${SUFFIXE}`);
  await page.getByLabel("Prénom").fill("Rania");
  await page.locator('select[name="role"]').selectOption({ label: "Responsable Commercial" });
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByText(/Compte .* créé/)).toBeVisible();
  Object.assign(RC, await lireAcces(page.getByTestId("bloc-acces").first()));

  await login(page, "COM2");
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(V.clientNom);
  await page.getByLabel("Prénom").fill("Karim");
  await page.getByLabel("Téléphone 1").fill("06 77 00 00 07");
  await page.getByLabel("E-mail").fill(`karim.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByTestId("bloc-acces")).toBeVisible();
  V.bienHref = await hrefBienStaff(page, V.bien);
  await page.goto(V.bienHref);
  V.bienId = (await page.getByTestId("bien-id").getAttribute("data-id"))!;
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  const select = page.locator("#clientId");
  const valeur = await select.evaluate((el, nom) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.includes(nom))?.value ?? "", V.clientNom);
  expect(valeur).not.toBe("");
  await select.selectOption(valeur);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: V.bien });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();
  await login(page, "COM2");
  V.hrefFiche = await ficheDepuisListe(page, V.clientNom);
  await login(page, "COM1");
  NACIRI.hrefFiche = await ficheDepuisListe(page, "Naciri");
  NACIRI.bienId = (await page.getByTestId("client-bien").getAttribute("data-bien-id"))!;
});

test("Commercial : le dossier d'un client suivi par un autre commercial lui est invisible (fiche, liste, recherche) et l'échéancier forgé est refusé", async ({ page }) => {
  await login(page, "COM1");
  for (const onglet of ["contrat", "paiements", "tma", "documents"]) {
    await page.goto(`${V.hrefFiche}?bien=${V.bienId}&onglet=${onglet}`);
    await expect(page.getByTestId("page-introuvable"), onglet).toBeVisible();
  }
  await page.goto("/dashboard/clients");
  await expect(page.getByRole("link", { name: new RegExp(V.clientNom) })).toHaveCount(0);
  const r = await (await page.request.get(`/api/recherche?q=${encodeURIComponent(V.clientNom)}`)).json();
  expect(r.groupes.filter((g: { type: string }) => g.type === "client")).toEqual([]);

  // Depuis son propre dossier (Naciri), COM1 substitue le bien vendu par COM2 : refusé, message explicite
  await page.goto(`${NACIRI.hrefFiche}?onglet=paiements`);
  await page.getByTestId("modifier-echeancier").click();
  const retirer = await forgerArgumentAction(page, NACIRI.bienId, V.bienId);
  await page.getByTestId("form-echeancier").getByTestId("enregistrer-echeancier").click();
  await expect(page.getByTestId("echeancier-erreur")).toContainText("Seul le commercial en charge de ce bien");
  await retirer();
});

test("Responsable Commercial : voit tout le pôle (fiche, liste, recherche) et modifie l'échéancier d'un bien vendu par un commercial", async ({ page }) => {
  await loginAvec(page, RC.identifiant, RC.mdp, /\/dashboard$/);
  await page.goto("/dashboard/clients");
  await expect(page.getByRole("link", { name: new RegExp(V.clientNom) }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Naciri/ }).first()).toBeVisible();
  const r = await (await page.request.get(`/api/recherche?q=${encodeURIComponent(V.clientNom)}`)).json();
  expect(r.groupes.map((g: { type: string }) => g.type)).toContain("client");
  for (const onglet of ["contrat", "paiements", "tma", "documents"]) {
    await page.goto(`${V.hrefFiche}?bien=${V.bienId}&onglet=${onglet}`);
    await expect(page.getByTestId(`onglet-${onglet}`), onglet).toBeVisible();
  }
  await page.goto(`${V.hrefFiche}?onglet=paiements`);
  await page.getByTestId("modifier-echeancier").click();
  const form = page.getByTestId("form-echeancier");
  const lignes = form.getByTestId("tranche-edition");
  await expect(lignes).toHaveCount(4);
  await form.getByTestId("ajouter-tranche").click();
  await expect(lignes).toHaveCount(5);
  await form.locator("#edition-tranche4Pourcentage").fill("10");
  await form.locator("#edition-tranche5Pourcentage").fill("10");
  await form.locator("#edition-tranche5Date").fill("2028-12-01");
  await form.getByTestId("enregistrer-echeancier").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Échéancier enregistré" })).toBeVisible();
  await expect(page.getByTestId("table-echeancier").locator("tbody tr")).toHaveCount(5);
});

test("contrat : seul le Responsable Administratif voit l'éditeur, la génération, la suppression douce et la restauration ; les autres rôles lisent seulement", async ({ page }) => {
  for (const compte of ["COM2", "COMPTA", "SAV"] as const) {
    await login(page, compte);
    await page.goto(`${V.hrefFiche}?onglet=contrat`);
    await expect(page.getByTestId("carte-contrat"), compte).toBeVisible();
    await expect(page.getByTestId("section-editeur-contrat"), compte).toHaveCount(0);
    await expect(page.getByTestId("editeur-contrat"), compte).toHaveCount(0);
    await expect(page.getByTestId("supprimer-contrat"), compte).toHaveCount(0);
    await expect(page.getByTestId("generer-pdf"), compte).toHaveCount(0);
    await expect(page.getByTestId("creer-contrat"), compte).toHaveCount(0);
  }
  await loginAvec(page, RC.identifiant, RC.mdp, /\/dashboard$/);
  await page.goto(`${V.hrefFiche}?onglet=contrat`);
  await expect(page.getByTestId("carte-contrat")).toBeVisible();
  await expect(page.getByTestId("editeur-contrat")).toHaveCount(0);
  await expect(page.getByTestId("supprimer-contrat")).toHaveCount(0);

  await login(page, "RESPADM");
  await page.goto(`${V.hrefFiche}?onglet=contrat`);
  await expect(page.getByTestId("editeur-contrat")).toBeVisible();
  await expect(page.getByTestId("supprimer-contrat")).toBeVisible();
  await expect(page.getByTestId("generer-pdf")).toBeVisible();
});

test("nettoyage : désistement de la vente de test, traité jusqu'au remboursement", async ({ page }) => {
  await login(page, "COM2");
  await page.goto(V.bienHref);
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-autorisation.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  await page.locator("[data-card]", { hasText: V.bien }).getByTestId("lien-fiche-client").click();
  const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
  await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
  await dossier.getByLabel("Décharge").fill("Nettoyage du test d'autorisation");
  await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
});
