import { expect, test } from "@playwright/test";
import { confirmer, login, ouvrirBienClient } from "./helpers";
import { texteDuPdf } from "../pdf-texte";

/*
 * Éditeur de contrat par sections (phase 2). Sur la vente A01 du seed, le
 * Responsable Administratif : trouve les sections pré-remplies au premier
 * accès, en modifie, réordonne, supprime et ajoute, enregistre, régénère le
 * PDF (l'ancienne version reste consultable), enregistre ses sections comme
 * modèle, supprime le contrat (suppression douce, annulable) puis en crée un
 * nouveau pour le même bien et le même client, pré-rempli depuis le modèle.
 */
test.describe.configure({ mode: "serial" });

const GARANTIE = "Garantie décennale";
const GARANTIE_PDF = GARANTIE.toUpperCase(); // les titres de section sont dessinés en majuscules dans le PDF
let hrefFiche = "";

test("sections pré-remplies, modification, ajout, réordonnancement et enregistrement journalisé", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto("/dashboard/contrats");
  await page.getByTestId("contrat-ligne").filter({ hasText: "Appartement A01" }).getByTestId("lien-fiche-client").click();
  await expect(page).toHaveURL(/onglet=contrat/);
  hrefFiche = page.url();
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "PRET");

  const editeur = page.getByTestId("editeur-contrat");
  const sections = editeur.getByTestId("section-contrat");
  await expect(sections).toHaveCount(6);
  await expect(sections.first().getByLabel("Titre de la section")).toHaveValue("Identité des parties");
  await expect(sections.nth(3).getByTestId("apercu-section")).toContainText("Tranche 1 · 40 %"); // jetons fusionnés dans l'aperçu

  // Modification, suppression (deux temps) et ajout d'une section libre
  await sections.first().getByLabel("Titre de la section").fill("Identité des parties (vérifiée)");
  await confirmer(page, "supprimer-section", sections.nth(4)); // « Conditions générales »
  await expect(sections).toHaveCount(5);
  await editeur.getByTestId("ajouter-section").click();
  await expect(sections).toHaveCount(6);
  await sections.last().getByLabel("Titre de la section").fill(GARANTIE);
  await sections.last().getByLabel("Texte").fill("Le vendeur garantit {{bien}} pendant dix ans à compter de la livraison.");
  await sections.last().getByRole("button", { name: "Monter la section" }).click();
  await expect(sections.nth(4).getByLabel("Titre de la section")).toHaveValue(GARANTIE);

  await editeur.getByTestId("enregistrer-sections").click();
  await expect(page.getByTestId("contrat-message")).toHaveText("Sections enregistrées.");
  await page.goto(hrefFiche);
  const rechargees = page.getByTestId("editeur-contrat").getByTestId("section-contrat");
  await expect(rechargees).toHaveCount(6);
  await expect(rechargees.first().getByLabel("Titre de la section")).toHaveValue("Identité des parties (vérifiée)");
  await expect(rechargees.nth(4).getByLabel("Titre de la section")).toHaveValue(GARANTIE);
  await expect(rechargees.nth(5).getByLabel("Titre de la section")).toHaveValue("Clause de désistement");

  await login(page, "PDG"); // le journal se lit avec un rôle de direction
  await page.goto("/dashboard/journal");
  const ligne = page.getByText(/Contrat Appartement A01/).first();
  await expect(ligne).toBeVisible();
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
  expect(texte).toContain("Le vendeur garantit Appartement A01 pendant dix ans"); // jeton {{bien}} fusionné dans le texte de la section
  expect(texte).toContain("VIR-2026-00458"); // annexe automatique : référence du paiement validé du seed
  expect(texte).not.toContain("CONDITIONS GÉNÉRALES");
  expect(await texteDuPdf(await (await page.request.get(ancienne!)).body())).not.toContain(GARANTIE_PDF);
});

test("modèle par défaut, suppression douce annulable, nouveau contrat pré-rempli depuis le modèle", async ({ page }) => {
  await login(page, "RESPADM");
  await page.goto(hrefFiche);
  const editeur = page.getByTestId("editeur-contrat");
  await editeur.getByTestId("enregistrer-modele").click();
  await expect(page.getByTestId("contrat-message")).toContainText("Modèle par défaut enregistré");

  // Suppression douce puis annulation depuis le toast
  await confirmer(page, "supprimer-contrat", editeur);
  await expect(page.getByTestId("toast").filter({ hasText: "Contrat supprimé" })).toBeVisible();
  await expect(page.getByTestId("carte-sans-contrat")).toBeVisible();
  await expect(page.getByTestId("section-contrats-supprimes").getByTestId("contrat-supprime")).toHaveCount(1);
  await page.getByTestId("toast-action").click();
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "PRET");
  await expect(page.getByTestId("section-contrats-supprimes")).toHaveCount(0);

  // Suppression définitive (douce) et création d'un nouveau contrat pour le même bien et le même client
  await confirmer(page, "supprimer-contrat", page.getByTestId("editeur-contrat"));
  await expect(page.getByTestId("carte-sans-contrat")).toBeVisible();
  const supprime = page.getByTestId("section-contrats-supprimes").getByTestId("contrat-supprime");
  await expect(supprime).toHaveCount(1);
  await expect(supprime.getByRole("link", { name: "Dernier PDF" })).toBeVisible();
  await expect(supprime.getByRole("link", { name: "Version 1" })).toBeVisible();
  await page.getByTestId("creer-contrat").click();
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "EN_ATTENTE");
  const sections = page.getByTestId("editeur-contrat").getByTestId("section-contrat");
  await expect(sections).toHaveCount(6); // sections du modèle enregistré, pas le jeu intégré
  await expect(sections.nth(4).getByLabel("Titre de la section")).toHaveValue(GARANTIE);
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
  expect(await texteDuPdf(await r.body())).toContain(GARANTIE_PDF);
});
