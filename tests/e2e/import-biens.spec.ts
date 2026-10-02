import { expect, test, type Page } from "@playwright/test";
import { classeurXlsx, login, SUFFIXE_RUN } from "./helpers";

/*
 * Import Excel des biens d'un projet par le Directeur Commercial, sur le
 * modèle de l'import des prospects : aperçu avant confirmation (biens
 * valides, lignes ignorées avec motif), aucune écriture avant « Confirmer »,
 * natures contrôlées contre la liste centrale, journal d'activité.
 */
test.describe.configure({ mode: "serial" });

const S = SUFFIXE_RUN;
const PROJET = /Résidence Al Manar/;

/** Ouvre le projet et rend le nombre de biens annoncé par le compteur de la liste (« n / total »), une fois tous les liens rendus. */
async function ouvrirProjet(page: Page): Promise<number> {
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: PROJET }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);
  const compteur = page.getByTestId("biens-compteur");
  await expect(compteur).toBeVisible();
  const total = Number((await compteur.innerText()).split("/")[1]);
  await expect(page.getByTestId("bien-lien")).toHaveCount(total);
  return total;
}

test("accès : le bouton d'import n'existe que pour le Directeur Commercial", async ({ page }) => {
  await login(page, "COM1");
  await ouvrirProjet(page);
  await expect(page.getByTestId("bouton-import-biens")).toHaveCount(0);
  await login(page, "DIRCOM");
  await ouvrirProjet(page);
  await expect(page.getByTestId("bouton-import-biens")).toBeVisible();
});

test("import de 10 biens de natures variées : aperçu avec les lignes ignorées et leurs motifs, rien d'écrit avant confirmation, biens créés « Disponible », journal", async ({ page }) => {
  await login(page, "DIRCOM");
  const avant = await ouvrirProjet(page);

  // En-têtes en ordre libre, accentués et en casse mixte ; natures écrites librement ; trois lignes invalides et un doublon
  const lignes = [
    { "Prix (MAD)": "80000", Surface: "18", NATURE: "garage", Désignation: `Garage G1-${S}` },
    { "Prix (MAD)": "1250000", Surface: "95,5", NATURE: "Appartement", Désignation: `Appartement C1-${S}` },
    { "Prix (MAD)": "2400000", Surface: "180", NATURE: "maison", Désignation: `Maison M1-${S}` },
    { "Prix (MAD)": "1900000", Surface: "140", NATURE: "Duplex", Désignation: `Duplex D1-${S}` },
    { "Prix (MAD)": "3500000", Surface: "260", NATURE: "villa", Désignation: `Villa V1-${S}` },
    { "Prix (MAD)": "600000", Surface: "32", NATURE: "Studio", Désignation: `Studio S1-${S}` },
    { "Prix (MAD)": "150000", Surface: "12", NATURE: "Parking", Désignation: `Parking P9-${S}` },
    { "Prix (MAD)": "980000", Surface: "60", NATURE: "Bureau", Désignation: `Bureau B1-${S}` },
    { "Prix (MAD)": "1200000", Surface: "400", NATURE: "Terrain constructible", Désignation: `Terrain T1-${S}` },
    { "Prix (MAD)": "1700000", Surface: "130", NATURE: "LOFT", Désignation: `Loft L1-${S}` },
    { "Prix (MAD)": "3000000", Surface: "250", NATURE: "Château", Désignation: `Château K1-${S}` },
    { "Prix (MAD)": "0", Surface: "50", NATURE: "Appartement", Désignation: `Appartement C2-${S}` },
    { "Prix (MAD)": "85000", Surface: "18", NATURE: "Garage", Désignation: `garage g1-${S}` },
    { "Prix (MAD)": "700000", Surface: "70", NATURE: "Appartement", Désignation: "Appartement A01" },
  ];
  await page.getByTestId("bouton-import-biens").click();
  await expect(page.getByTestId("panneau-import-biens")).toBeVisible();
  await page.getByTestId("fichier-import-biens").setInputFiles(classeurXlsx(lignes, `contenance-${S}.xlsx`));
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByTestId("import-biens-apercu")).toBeVisible();
  await expect(page.getByTestId("apercu-biens-valides")).toHaveText("10 biens valides");
  await expect(page.getByTestId("apercu-biens-ignorees")).toHaveText("4 lignes ignorées");
  const motifs = page.getByTestId("apercu-biens-motifs");
  await expect(motifs).toContainText("Ligne 12 : nature non reconnue (« Château »)");
  await expect(motifs).toContainText("Ligne 13 : prix invalide (« 0 »)");
  await expect(motifs).toContainText("Ligne 14 : doublon de la désignation de la ligne 2");
  await expect(motifs).toContainText("Ligne 15 : désignation déjà présente dans le projet");
  await expect(page.getByTestId("apercu-bien")).toHaveCount(10);
  await expect(page.getByTestId("apercu-bien").filter({ hasText: `Garage G1-${S}` })).toHaveAttribute("data-nature", "Garage");
  await expect(page.getByTestId("apercu-bien").filter({ hasText: `Loft L1-${S}` })).toHaveAttribute("data-nature", "Loft");

  // Rien n'est écrit avant la confirmation
  const autre = await page.context().newPage();
  await login(autre, "DIRCOM");
  expect(await ouvrirProjet(autre)).toBe(avant);
  await autre.close();

  await page.getByTestId("confirmer-import-biens").click();
  await expect(page.getByTestId("import-biens-succes")).toContainText("10 biens importés (4 lignes ignorées), au statut « Disponible »");
  await expect(page.getByTestId("bien-lien")).toHaveCount(avant + 10);
  for (const d of [`Garage G1-${S}`, `Duplex D1-${S}`, `Maison M1-${S}`, `Terrain T1-${S}`]) {
    await expect(page.getByRole("link", { name: d, exact: true })).toBeVisible();
  }
  // Le filtre par nature de la liste connaît les natures importées ; un bien importé est « Disponible »
  await expect(page.getByTestId("filtre-nature").locator("option", { hasText: "Duplex" })).toHaveCount(1);
  await page.getByRole("link", { name: `Duplex D1-${S}`, exact: true }).click();
  await expect(page.getByText("Disponible").first()).toBeVisible();

  await page.goto("/dashboard/journal?periode=jour");
  const ligneJournal = page.getByTestId("journal-ligne").filter({ hasText: `10 biens importés (contenance-${S}.xlsx)` });
  await expect(ligneJournal).toHaveCount(1);
  await expect(ligneJournal).toContainText("Sara Bennis");
  await expect(ligneJournal).toContainText("4 lignes ignorées");
});

test("fichiers refusés : colonne manquante, feuille sans aucun bien valide", async ({ page }) => {
  await login(page, "DIRCOM");
  await ouvrirProjet(page);
  await page.getByTestId("bouton-import-biens").click();
  await page.getByTestId("fichier-import-biens").setInputFiles(classeurXlsx([{ Désignation: "X", Prix: "1", Surface: "1" }], "sans-nature.xlsx"));
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByTestId("import-biens-erreur")).toContainText("Colonne nature introuvable");
  await page.getByTestId("fichier-import-biens").setInputFiles(classeurXlsx([{ Désignation: "Y", Nature: "Château", Prix: "1", Surface: "1" }], "invalide.xlsx"));
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByTestId("import-biens-erreur")).toContainText("Aucun bien valide");
  await expect(page.getByTestId("import-biens-erreur")).toContainText("Château");
});
