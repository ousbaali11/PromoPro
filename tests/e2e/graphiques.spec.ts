import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

/*
 * Graphiques des tableaux de bord alimentés par la plage de dates : en
 * changeant la plage, les totaux (cartes Stat) et les graphiques (barres,
 * courbe) se mettent à jour, pour quatre rôles différents. Le jeu de
 * démonstration porte une vente acceptée le jour même et un paiement validé
 * il y a environ 40 jours ; les specs précédents ont validé des paiements et
 * traité une visite aujourd'hui.
 */
async function valeur(page: Page, cle: string) {
  return Number(await page.getByTestId(`stat-periode-${cle}`).getAttribute("data-valeur"));
}
async function totalGraphique(page: Page, testId: string) {
  return Number(await page.getByTestId(testId).getAttribute("data-total"));
}

test("PDG : ventes et chiffre d'affaires suivent la plage (la semaine dernière → cette année)", async ({ page }) => {
  await login(page, "PDG");
  // La vente du seed est datée du jour : « la semaine dernière » n'en contient aucune
  await page.goto("/dashboard?plage=semaine-derniere");
  await expect(page.getByTestId("graphiques")).toHaveAttribute("data-plage", "semaine-derniere");
  const ventes7j = await valeur(page, "ventes");
  const ca7j = await valeur(page, "ca");
  expect(ventes7j).toBe(0);

  await page.getByTestId("selecteur-plage-bouton").click();
  await page.getByTestId("plage-rapide-annee").click();
  await expect(page.getByTestId("graphiques")).toHaveAttribute("data-plage", "annee");
  const ventesAnnee = await valeur(page, "ventes");
  const caAnnee = await valeur(page, "ca");
  expect(ventesAnnee).toBeGreaterThan(ventes7j);
  expect(caAnnee).toBeGreaterThan(ca7j);
  expect(await totalGraphique(page, "graphique-barres")).toBe(ventesAnnee);
  expect(await totalGraphique(page, "graphique-courbe")).toBe(caAnnee);
  await expect(page.getByTestId("graphique-barres").locator("svg").first()).toBeVisible();
  await expect(page.getByTestId("graphique-courbe").locator("svg").first()).toBeVisible();
});

test("Comptable Interne : paiements validés par période", async ({ page }) => {
  await login(page, "COMPTA");
  await page.goto("/dashboard?plage=7j");
  const semaine = await valeur(page, "operations");
  expect(semaine).toBeGreaterThanOrEqual(1); // validés aujourd'hui par les specs précédents
  await page.goto("/dashboard?plage=annee");
  const annee = await valeur(page, "operations");
  expect(annee).toBeGreaterThan(semaine); // + le paiement du seed, il y a ~40 jours
  expect(await totalGraphique(page, "graphique-barres")).toBe(annee);
});

test("Directeur Financier : encaissements réels par période, et le commercial voit ses ventes", async ({ page }) => {
  await login(page, "DIRFIN");
  await page.goto("/dashboard?plage=7j");
  const encaisse7j = await valeur(page, "encaisse");
  await page.goto("/dashboard?plage=annee");
  const encaisseAnnee = await valeur(page, "encaisse");
  expect(encaisseAnnee).toBeGreaterThan(encaisse7j);
  expect(await totalGraphique(page, "graphique-barres")).toBe(encaisseAnnee);
  expect(await totalGraphique(page, "graphique-courbe")).toBe(encaisseAnnee);

  await login(page, "COM1");
  await page.goto("/dashboard?plage=annee");
  expect(await valeur(page, "ventes")).toBeGreaterThanOrEqual(1); // A01 vendu par COM1
  await page.goto("/dashboard?plage=7j");
  await expect(page.getByTestId("stat-periode-prospects")).toBeVisible();
});

test("SAV : demandes traitées sur la période (aujourd'hui ≥ 1, la semaine dernière = 0)", async ({ page }) => {
  await login(page, "SAV");
  await page.goto("/dashboard?plage=7j");
  expect(await valeur(page, "visites")).toBeGreaterThanOrEqual(1);
  await page.goto("/dashboard?plage=semaine-derniere");
  expect(await valeur(page, "visites")).toBe(0);
  expect(await totalGraphique(page, "graphique-barres")).toBe(0);
  // État vide explicite à la place des axes à zéro (un par graphique), totaux conservés
  await expect(page.getByTestId("graphique-vide")).toHaveCount(2);
  await expect(page.getByTestId("graphique-vide").first()).toContainText("Aucune donnée sur cette période");
  await expect(page.getByTestId("graphique-barres").locator("svg")).toHaveCount(0);
});

test("panne du calcul des graphiques : message localisé à la section, reste du tableau de bord intact, Réessayer", async ({ page }) => {
  await login(page, "PDG");
  await page.goto("/dashboard?plage=7j&graphiques=panne");
  const erreur = page.getByTestId("graphiques-erreur");
  await expect(erreur).toBeVisible();
  await expect(erreur).toContainText("Les graphiques n'ont pas pu être calculés");
  await expect(page.getByTestId("graphiques")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // la page n'est pas tombée sur error.tsx
  await expect(page.getByTestId("selecteur-plage")).toBeVisible();
  await expect(page.getByText("Une erreur est survenue")).toHaveCount(0);
  // Réessayer : la panne est portée par l'URL, on la retire puis la section revient
  await page.goto("/dashboard?plage=7j");
  await expect(page.getByTestId("graphiques")).toHaveAttribute("data-plage", "7j");
  await expect(page.getByTestId("graphiques-erreur")).toHaveCount(0);
});
