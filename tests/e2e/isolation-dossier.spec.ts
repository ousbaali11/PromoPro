import { expect, test, type Page } from "@playwright/test";
import { confirmer, forgerArgumentAction, login, loginAvec, SUFFIXE_RUN, ouvrirFicheClientDepuisListe } from "./helpers";

/*
 * Isolation multi-promoteur sur le territoire de la restructuration : fiche
 * client centralisée (quatre onglets), éditeur de contrat par sections (lire,
 * modifier, générer le PDF, historique des versions, suppression douce,
 * nouveau contrat), modèle de contrat par défaut, modification d'échéancier.
 * Même méthode qu'isolation.spec.ts : un vrai promoteur « C » est créé de
 * zéro avec sa vente, son contrat (deux versions de PDF) et son modèle ; le
 * staff du promoteur de démonstration (A) tente ensuite d'y accéder par URL,
 * par fichier et par action forgée (identifiant substitué dans le corps de la
 * Server Action). Chaque tentative doit échouer sans rien changer chez C.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const C = {
  nom: `Promoteur C ${SUFFIXE}`,
  projet: `Projet C ${SUFFIXE}`,
  bien: `Villa C1 ${SUFFIXE}`,
  clientNom: `Cherkaoui${SUFFIXE}`,
  pdg: { identifiant: "", mdp: "" },
  dircom: { identifiant: "", mdp: "" },
  com: { identifiant: "", mdp: "" },
  respadm: { identifiant: "", mdp: "" },
  client: { identifiant: "", mdp: "", id: "" },
  bienId: "",
  bienHref: "",
  hrefFiche: "",
  contratId: "",
  trancheIds: [] as string[],
  pdfCourant: "",
  pdfArchive: "",
  titreSection: `Section C ${SUFFIXE}`,
  titreModele: `Modèle C ${SUFFIXE}`,
};
const A = { contratId: "", bienId: "", clientId: "", hrefFiche: "", trancheIds: [] as string[] };

async function lireAcces(bloc: ReturnType<Page["getByTestId"]>) {
  const dd = bloc.locator("dd");
  return { identifiant: (await dd.nth(0).innerText()).trim(), mdp: (await dd.nth(1).innerText()).trim() };
}

async function recruter(page: Page, role: string, nom: string, prenom: string) {
  await page.goto("/dashboard/equipe");
  await page.locator('form[data-hydrated="true"]').first().waitFor();
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page.getByLabel("Prénom").fill(prenom);
  await page.locator('select[name="role"]').selectOption({ label: role });
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByText(/Compte .* créé/)).toBeVisible();
  return lireAcces(page.getByTestId("bloc-acces").first());
}

async function ouvrirFicheClient(page: Page, nom: string) {
  await page.goto("/dashboard/clients");
  await ouvrirFicheClientDepuisListe(page, new RegExp(nom));
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
  return page.url().split("?")[0];
}

/** Identifiants des tranches (inputs cachés de l'éditeur d'échéancier), puis annulation. */
/** Titres des sections du modèle par défaut affiché (valeurs des champs Titre). */
async function titresModele(page: Page) {
  await expect(page.getByTestId("editeur-modele")).toBeVisible();
  return page.getByTestId("section-modele").getByLabel("Titre de la section").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

async function lireTranches(page: Page, hrefFiche: string) {
  await page.goto(`${hrefFiche}?onglet=paiements`);
  await page.getByTestId("modifier-echeancier").click();
  const ids = await page.getByTestId("form-echeancier").locator('input[name="trancheId"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  await page.getByTestId("form-echeancier").getByRole("button", { name: "Annuler" }).click();
  return ids.filter(Boolean);
}

test("mise en place : promoteur C, vente conclue, contrat en deux versions, modèle par défaut, échéancier", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "SUPERADMIN");
  await page.goto("/admin/nouveau");
  await page.getByLabel("Nom du promoteur").fill(C.nom);
  for (const [champ, nom] of [
    ["pdg", "Pdg"],
    ["dircom", "Dircom"],
    ["dirfin", "Dirfin"],
  ] as const) {
    await page.locator(`#${champ}Nom`).fill(`${nom} C`);
    await page.locator(`#${champ}Prenom`).fill("Isolation");
  }
  await page.getByRole("button", { name: /Créer le promoteur/ }).click();
  const blocs = page.getByTestId("bloc-acces");
  await expect(blocs).toHaveCount(3);
  C.pdg = await lireAcces(blocs.filter({ hasText: "PDG" }));
  C.dircom = await lireAcces(blocs.filter({ hasText: "Directeur Commercial" }));
  await page.goto("/admin");
  const lignePromoteur = page.getByTestId("promoteur-ligne").filter({ hasText: C.nom });
  await lignePromoteur.getByRole("button", { name: "Activer" }).click();
  await expect(lignePromoteur.locator('[data-statut="ACTIF"]')).toBeVisible();

  // Directeur Commercial C : projet, bien, commercial, responsable administratif
  await loginAvec(page, C.dircom.identifiant, C.dircom.mdp, /\/dashboard$/);
  await page.goto("/dashboard/projets/nouveau");
  await page.getByLabel("Nom du projet").fill(C.projet);
  await page.getByLabel(/Nom du compte/).fill("SCI C");
  await page.getByLabel(/IBAN/).fill("MA00 1111 2222 3333 4444 5555");
  await page.getByRole("button", { name: /Créer le projet/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/(?!nouveau)[^/]+$/);
  const formBien = page.getByTestId("form-ajout-bien");
  await formBien.getByLabel("Désignation").fill(C.bien);
  await formBien.getByLabel(/Prix/).fill("900000");
  await formBien.getByLabel(/Surface/).fill("120");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  const lienBien = page.getByRole("link", { name: C.bien });
  await expect(lienBien).toBeVisible();
  C.bienHref = (await lienBien.getAttribute("href"))!;
  await page.goto(C.bienHref);
  C.bienId = (await page.getByTestId("bien-id").getAttribute("data-id"))!;
  expect(C.bienId).toMatch(/^[0-9a-f-]{36}$/);
  C.com = await recruter(page, "Commercial", "Isolation", "Commercial C");
  C.respadm = await recruter(page, "Responsable Administratif", "Isolation", "Respadm C");

  // Commercial C : client puis proposition ; PDG C accepte
  await loginAvec(page, C.com.identifiant, C.com.mdp, /\/dashboard$/);
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(C.clientNom);
  await page.getByLabel("Prénom").fill("Nawal");
  await page.getByLabel("Téléphone 1").fill("06 77 00 00 03");
  await page.getByLabel("E-mail").fill(`nawal.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  const accesClient = await lireAcces(page.getByTestId("bloc-acces"));
  C.hrefFiche = await ouvrirFicheClient(page, C.clientNom);
  C.client = { ...accesClient, id: C.hrefFiche.split("/").pop()! };
  await page.goto(`/dashboard/propositions/nouvelle?bienId=${C.bienId}`);
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  const select = page.locator("#clientId");
  const valeur = await select.evaluate((el, nom) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.includes(nom))?.value ?? "", C.clientNom);
  expect(valeur).not.toBe("");
  await select.selectOption(valeur);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
  await loginAvec(page, C.pdg.identifiant, C.pdg.mdp, /\/dashboard$/);
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: C.bien });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();

  // Responsable Administratif C : sections modifiées, PDF généré deux fois (une version archivée), modèle par défaut personnalisé
  await loginAvec(page, C.respadm.identifiant, C.respadm.mdp, /\/dashboard$/);
  await page.goto(`${C.hrefFiche}?onglet=contrat`);
  C.contratId = (await page.getByTestId("carte-contrat").getAttribute("data-contrat-id"))!;
  expect(C.contratId).toMatch(/^[0-9a-f-]{36}$/);
  const editeur = page.locator('[data-testid="editeur-contrat"][data-hydrated="true"]');
  await expect(editeur).toBeVisible();
  await editeur.getByTestId("section-contrat").first().getByLabel("Titre de la section").fill(C.titreSection);
  await editeur.getByTestId("enregistrer-sections").click();
  await expect(page.getByTestId("contrat-message")).toContainText("Sections enregistrées");
  await editeur.getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText("version 1");
  await page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click();
  await expect(page.getByTestId("contrat-message")).toContainText("version 2");
  await expect(page.getByTestId("version-pdf")).toHaveCount(1);
  C.pdfCourant = (await page.getByTestId("lien-contrat-pdf").getAttribute("href"))!;
  C.pdfArchive = (await page.getByTestId("version-pdf").first().getByRole("link").getAttribute("href"))!;
  expect(C.pdfCourant).toMatch(/^\/api\/files\/contrats\//);
  expect(C.pdfArchive).toMatch(/^\/api\/files\/contrats\//);
  expect(C.pdfArchive).not.toBe(C.pdfCourant);

  await page.goto("/dashboard/contrats/modele");
  await page.locator('[data-testid="editeur-modele"][data-hydrated="true"]').waitFor();
  await page.getByTestId("ajouter-section-modele").click();
  const nouvelle = page.getByTestId("section-modele").last();
  await nouvelle.getByLabel("Titre de la section").fill(C.titreModele);
  await nouvelle.getByTestId("zone-segments").click();
  await page.keyboard.type("Clause propre au promoteur C.");
  await page.getByTestId("enregistrer-modele").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Modèle par défaut enregistré" })).toBeVisible();

  // Commercial C : identifiants des tranches
  await loginAvec(page, C.com.identifiant, C.com.mdp, /\/dashboard$/);
  C.trancheIds = await lireTranches(page, C.hrefFiche);
  expect(C.trancheIds.length).toBeGreaterThanOrEqual(4);

  // Côté A : identifiants du dossier de démonstration (contrat A01 de Hamid Naciri)
  await login(page, "RESPADM");
  A.hrefFiche = await ouvrirFicheClient(page, "Naciri");
  A.clientId = A.hrefFiche.split("/").pop()!;
  await page.goto(`${A.hrefFiche}?onglet=contrat`);
  A.contratId = (await page.getByTestId("carte-contrat").getAttribute("data-contrat-id"))!;
  A.bienId = (await page.getByTestId("client-bien").getAttribute("data-bien-id"))!;
  expect(A.contratId).toMatch(/^[0-9a-f-]{36}$/);
  await login(page, "COM1");
  A.trancheIds = await lireTranches(page, A.hrefFiche);
  expect(A.trancheIds.length).toBeGreaterThanOrEqual(4);
});

test("pages et fichiers : les quatre onglets de la fiche de C répondent 404 au staff de A, ses PDF courant et archivé 403, et ?bien= étranger retombe sur un bien de A", async ({ page }) => {
  for (const compte of ["RESPADM", "COM1", "COMPTA", "SAV"] as const) {
    await login(page, compte);
    for (const onglet of ["contrat", "paiements", "tma", "documents"]) {
      const url = `/dashboard/clients/${C.client.id}?bien=${C.bienId}&onglet=${onglet}`;
      await page.goto(url);
      await expect(page.getByTestId("page-introuvable"), `${compte} ${url}`).toBeVisible();
    }
    expect((await page.request.get(C.pdfCourant)).status(), `${compte} PDF courant`).toBe(403);
    expect((await page.request.get(C.pdfArchive)).status(), `${compte} PDF archivé`).toBe(403);
  }
  // Un identifiant de bien étranger dans l'URL de sa propre fiche ne fait pas apparaître le bien de C
  await login(page, "RESPADM");
  await page.goto(`${A.hrefFiche}?bien=${C.bienId}&onglet=contrat`);
  await expect(page.getByTestId("bien-selectionne")).toHaveText("Appartement A01");
  await expect(page.locator("body")).not.toContainText(C.bien);
  // Les index de A ignorent C
  await page.goto("/dashboard/contrats");
  await expect(page.locator("body")).not.toContainText(C.bien);
  // Les fichiers de C sont bien servis à C, et refusés sans session
  await loginAvec(page, C.respadm.identifiant, C.respadm.mdp, /\/dashboard$/);
  for (const url of [C.pdfCourant, C.pdfArchive]) {
    const r = await page.request.get(url);
    expect(r.status(), url).toBe(200);
    expect(r.headers()["content-type"], url).toContain("application/pdf");
  }
  await page.context().clearCookies();
  expect((await page.request.get(C.pdfCourant)).status()).toBe(401);
});

test("actions forgées sur le contrat : enregistrer, générer, repartir du modèle, supprimer, restaurer et créer avec les identifiants de C sont refusés, rien ne change chez C", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "RESPADM");
  await page.goto(`${A.hrefFiche}?onglet=contrat`);
  const editeur = page.getByTestId("editeur-contrat");
  const erreur = editeur.getByText("Contrat introuvable.");

  let retirer = await forgerArgumentAction(page, A.contratId, C.contratId);
  await editeur.getByTestId("enregistrer-sections").click();
  await expect(erreur).toBeVisible();
  await retirer();

  await page.reload();
  retirer = await forgerArgumentAction(page, A.contratId, C.contratId);
  await page.getByTestId("editeur-contrat").getByTestId("generer-pdf").click();
  await expect(page.getByTestId("editeur-contrat").getByText("Contrat introuvable.")).toBeVisible();
  await retirer();

  await page.reload();
  retirer = await forgerArgumentAction(page, A.contratId, C.contratId);
  await confirmer(page, "repartir-modele", page.getByTestId("editeur-contrat"));
  await expect(page.getByTestId("editeur-contrat").getByText("Contrat introuvable.")).toBeVisible();
  await retirer();

  await page.reload();
  retirer = await forgerArgumentAction(page, A.contratId, C.contratId);
  await confirmer(page, "supprimer-contrat", page.getByTestId("editeur-contrat"));
  await expect(page.getByTestId("editeur-contrat").getByText("Contrat introuvable.")).toBeVisible();
  await retirer();

  // Créer un contrat pour le bien de C depuis A : on libère d'abord le bouton en supprimant (doucement) le contrat de A, puis on le restaure
  await page.reload();
  await confirmer(page, "supprimer-contrat", page.getByTestId("editeur-contrat"));
  await expect(page.getByTestId("toast").filter({ hasText: "Contrat supprimé" })).toBeVisible();
  await expect(page.getByTestId("creer-contrat")).toBeVisible();
  retirer = await forgerArgumentAction(page, A.bienId, C.bienId);
  await page.getByTestId("creer-contrat").click();
  await expect(page.getByText("Bien introuvable.")).toBeVisible();
  await retirer();
  // Restaurer le contrat de C (non supprimé) depuis A : refusé avant toute vérification d'état
  retirer = await forgerArgumentAction(page, A.contratId, C.contratId);
  await page.getByTestId("section-contrats-supprimes").getByTestId("restaurer-contrat").first().click();
  await expect(page.getByText("Contrat introuvable.")).toBeVisible();
  await retirer();
  await page.reload();
  await page.getByTestId("section-contrats-supprimes").getByTestId("restaurer-contrat").first().click();
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-contrat-id", A.contratId);

  // Modèle par défaut : la sauvegarde de A (sans changement) n'écrit que chez A
  await page.goto("/dashboard/contrats/modele");
  expect(await titresModele(page)).not.toContain(C.titreModele);
  await page.getByTestId("enregistrer-modele").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Modèle par défaut enregistré" })).toBeVisible();

  // Chez C : contrat actif, sections, historique et modèle intacts
  await loginAvec(page, C.respadm.identifiant, C.respadm.mdp, /\/dashboard$/);
  await page.goto(`${C.hrefFiche}?onglet=contrat`);
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-contrat-id", C.contratId);
  await expect(page.getByTestId("carte-contrat")).toHaveAttribute("data-statut", "PRET");
  await expect(page.getByTestId("editeur-contrat").getByTestId("section-contrat").first().getByLabel("Titre de la section")).toHaveValue(C.titreSection);
  await expect(page.getByTestId("version-pdf")).toHaveCount(1);
  await expect(page.getByTestId("lien-contrat-pdf")).toHaveAttribute("href", C.pdfCourant);
  await expect(page.getByTestId("section-contrats-supprimes")).toHaveCount(0);
  await page.goto("/dashboard/contrats/modele");
  expect(await titresModele(page)).toContain(C.titreModele);
});

test("actions forgées sur l'échéancier : bien de C substitué, puis tranche de C substituée dans le formulaire de A — refusés, l'échéancier de C reste intact", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(`${A.hrefFiche}?onglet=paiements`);
  await page.getByTestId("modifier-echeancier").click();
  const form = page.getByTestId("form-echeancier");
  const retirer = await forgerArgumentAction(page, A.bienId, C.bienId);
  await form.getByTestId("enregistrer-echeancier").click();
  await expect(page.getByTestId("echeancier-erreur")).toHaveText("Bien introuvable.");
  await retirer();

  await page.reload();
  await page.getByTestId("modifier-echeancier").click();
  const form2 = page.getByTestId("form-echeancier");
  await form2.locator('input[name="trancheId"]').last().evaluate((el, id) => ((el as HTMLInputElement).value = id), C.trancheIds[C.trancheIds.length - 1]);
  await form2.getByTestId("enregistrer-echeancier").click();
  await expect(page.getByTestId("echeancier-erreur")).toContainText("n'appartient pas à cet échéancier");

  await loginAvec(page, C.com.identifiant, C.com.mdp, /\/dashboard$/);
  expect(await lireTranches(page, C.hrefFiche)).toEqual(C.trancheIds);
});
