import { expect, test } from "@playwright/test";
import { confirmer, login, ouvrirBienClient } from "./helpers";
import { texteDuPdf } from "../pdf-texte";

/*
 * Éditeur du contrat d'un dossier précis (Responsable Administratif) : du
 * texte simple, déjà rempli avec les vraies données du dossier, sans aucune
 * syntaxe « {{…}} ». Sur la vente A01 du seed — dont les sections ont été
 * insérées au format HÉRITÉ (jetons) par scripts/e2e-donnees-heritees.ts puis
 * converties par la migration ponctuelle — le Responsable Administratif :
 * vérifie le texte résolu, modifie, réordonne, supprime et ajoute, enregistre,
 * régénère le PDF (ancienne version consultable), supprime le contrat
 * (suppression douce, annulable) puis en crée un nouveau pour le même bien et
 * le même client, lui aussi pré-rempli sans jeton.
 */
test.describe.configure({ mode: "serial" });

const GARANTIE = "Garantie décennale";
const GARANTIE_PDF = GARANTIE.toUpperCase(); // les titres de section sont dessinés en majuscules dans le PDF
let hrefFiche = "";

test("sections migrées puis résolues : texte simple avec les données du dossier, aucun jeton ; modification, ajout, réordonnancement, journal", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto("/dashboard/contrats");
  await expect(page.getByTestId("lien-modele-defaut")).toBeVisible(); // le modèle se gère sur un écran séparé
  await page.getByTestId("contrat-ligne").filter({ hasText: "Appartement A01" }).getByTestId("lien-fiche-client").click();
  await expect(page).toHaveURL(/onglet=contrat/);
  hrefFiche = page.url();
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "PRET");

  const editeur = page.getByTestId("editeur-contrat");
  const sections = editeur.getByTestId("section-contrat");
  await expect(sections).toHaveCount(6);
  await expect(sections.first().getByLabel("Titre de la section")).toHaveValue("Identité des parties");
  // Migration : les jetons hérités ont été remplacés par les données du dossier
  await expect(sections.first().getByLabel("Texte")).toHaveValue(/Le vendeur : Résidences Atlas/);
  await expect(sections.first().getByLabel("Texte")).toHaveValue(/NACIRI Hamid/);
  await expect(sections.nth(1).getByLabel("Texte")).toHaveValue(/Appartement A01/);
  await expect(sections.nth(3).getByLabel("Texte")).toHaveValue(/Tranche 1 · 40 %/);
  for (let i = 0; i < 6; i++) expect(await sections.nth(i).getByLabel("Texte").inputValue(), `section ${i + 1}`).not.toMatch(/\{\{|\}\}/);
  await expect(editeur).not.toContainText("{{");

  // Modification, suppression (deux temps) et ajout d'une section libre : du texte, rien d'autre
  await sections.first().getByLabel("Titre de la section").fill("Identité des parties (vérifiée)");
  await confirmer(page, "supprimer-section", sections.nth(4)); // « Conditions générales »
  await expect(sections).toHaveCount(5);
  await editeur.getByTestId("ajouter-section").click();
  await expect(sections).toHaveCount(6);
  await sections.last().getByLabel("Titre de la section").fill(GARANTIE);
  await sections.last().getByLabel("Texte").fill("Le vendeur garantit l'Appartement A01 pendant dix ans à compter de la livraison.");
  await sections.last().getByRole("button", { name: "Monter la section" }).click();
  await expect(sections.nth(4).getByLabel("Titre de la section")).toHaveValue(GARANTIE);

  await editeur.getByTestId("enregistrer-sections").click();
  await expect(page.getByTestId("contrat-message")).toHaveText("Sections enregistrées.");
  await page.goto(hrefFiche);
  const rechargees = page.getByTestId("editeur-contrat").getByTestId("section-contrat");
  await expect(rechargees).toHaveCount(6);
  await expect(rechargees.first().getByLabel("Titre de la section")).toHaveValue("Identité des parties (vérifiée)");
  await expect(rechargees.nth(4).getByLabel("Texte")).toHaveValue("Le vendeur garantit l'Appartement A01 pendant dix ans à compter de la livraison."); // enregistré tel quel
  await expect(rechargees.nth(5).getByLabel("Titre de la section")).toHaveValue("Clause de désistement");

  await login(page, "PDG"); // le journal se lit avec un rôle de direction
  await page.goto("/dashboard/journal");
  await expect(page.getByText(/Contrat Appartement A01/).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`section « ${GARANTIE} » ajoutée`)).first()).toBeVisible();
  await expect(page.getByText(/section « Conditions générales » supprimée/).first()).toBeVisible();
});

test("régénération du PDF d'un contrat déjà confirmé : nouvelle version, ancienne archivée et consultable", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto(hrefFiche);
  const carte = page.getByTestId("carte-contrat");
  const ancienne = await carte.getByTestId("lien-contrat-pdf").getAttribute("href");
  expect(ancienne).toMatch(/^\/api\/files\/contrats\//);

  // Des versions peuvent déjà être archivées (régénération à chaque paiement validé par un spec précédent)
  const versionsAvant = await page.getByTestId("historique-pdf").getByTestId("version-pdf").count();
  await page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText(`PDF régénéré (version ${versionsAvant + 2})`);
  await expect(carte).toHaveAttribute("data-statut", "PRET");
  const nouvelle = await carte.getByTestId("lien-contrat-pdf").getAttribute("href");
  expect(nouvelle).not.toBe(ancienne);

  const versions = page.getByTestId("historique-pdf").getByTestId("version-pdf");
  await expect(versions).toHaveCount(versionsAvant + 1);
  expect(await versions.first().getByRole("link", { name: "Ouvrir" }).getAttribute("href")).toBe(ancienne);
  for (const href of [ancienne!, nouvelle!]) {
    const r = await page.request.get(href);
    expect(r.status(), href).toBe(200);
    expect(r.headers()["content-type"], href).toContain("application/pdf");
  }
  const texte = await texteDuPdf(await (await page.request.get(nouvelle!)).body());
  expect(texte).toContain(GARANTIE_PDF);
  expect(texte).toContain("Le vendeur garantit l'Appartement A01 pendant dix ans");
  expect(texte).toContain("NACIRI Hamid");
  expect(texte).toContain("VIR-2026-00458"); // annexe automatique : référence du paiement validé du seed
  expect(texte).not.toContain("CONDITIONS GÉNÉRALES");
  expect(texte).not.toMatch(/\{\{|\}\}/);
});

test("suppression douce annulable, puis nouveau contrat pour le même bien et le même client, pré-rempli sans jeton", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto(hrefFiche);
  const editeur = page.getByTestId("editeur-contrat");

  // Suppression douce puis annulation depuis le toast
  await confirmer(page, "supprimer-contrat", editeur);
  await expect(page.getByTestId("toast").filter({ hasText: "Contrat supprimé" })).toBeVisible();
  await expect(page.getByTestId("carte-sans-contrat")).toBeVisible();
  await expect(page.getByTestId("section-contrats-supprimes").getByTestId("contrat-supprime")).toHaveCount(1);
  await page.getByTestId("toast-action").click();
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "PRET");
  await expect(page.getByTestId("section-contrats-supprimes")).toHaveCount(0);

  // Suppression définitive (douce) et création d'un nouveau contrat
  await confirmer(page, "supprimer-contrat", page.getByTestId("editeur-contrat"));
  await expect(page.getByTestId("carte-sans-contrat")).toBeVisible();
  const supprime = page.getByTestId("section-contrats-supprimes").getByTestId("contrat-supprime");
  await expect(supprime).toHaveCount(1);
  await expect(supprime.getByRole("link", { name: "Dernier PDF" })).toBeVisible();
  await expect(supprime.getByRole("link", { name: "Version 1" })).toBeVisible();
  await page.getByTestId("creer-contrat").click();
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "EN_ATTENTE");
  const sections = page.getByTestId("editeur-contrat").getByTestId("section-contrat");
  await expect(sections).toHaveCount(6); // modèle du promoteur (hérité, converti par la migration), résolu pour ce dossier
  await expect(sections.first().getByLabel("Texte")).toHaveValue(/NACIRI Hamid/);
  await expect(page.getByTestId("editeur-contrat")).not.toContainText("{{");
  await expect(page.getByTestId("section-contrats-supprimes").getByTestId("contrat-supprime")).toHaveCount(1);

  // Première génération = confirmation ; l'index et l'espace client suivent
  await page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText("Contrat confirmé : PDF généré (version 1)");
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "PRET");
  await page.goto("/dashboard/contrats");
  await expect(page.getByTestId("contrat-ligne").filter({ hasText: "Appartement A01" })).toHaveCount(1);

  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const lien = page.getByRole("link", { name: "Contrat de vente (PDF)" });
  await expect(lien).toBeVisible();
  const r = await page.request.get((await lien.getAttribute("href"))!);
  expect(r.status()).toBe(200);
  const texte = await texteDuPdf(await r.body());
  expect(texte).toContain("NACIRI Hamid");
  expect(texte).not.toMatch(/\{\{|\}\}/);
});
