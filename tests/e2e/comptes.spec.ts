import { expect, test, type Locator, type Page } from "@playwright/test";
import { login } from "./helpers";

/*
 * Suppression douce, suspension, annulation par le toast, restauration et
 * journal d'activité. Chaque test remet l'état initial (comptes de test
 * créés puis restaurés, Hamid Naciri réactivé) pour rester indépendant des
 * specs suivantes.
 */

const SUFFIXE = Date.now().toString(36).slice(-4).toUpperCase();

async function creerClient(page: Page, nom: string, prenom: string) {
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page.getByLabel("Prénom").fill(prenom);
  await page.getByLabel("Téléphone 1").fill("+212 6 99 99 99 99");
  await page.getByLabel("E-mail", { exact: true }).fill(`${nom.toLowerCase()}@example.com`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByText("Client créé")).toBeVisible();
}

/** Clic en deux temps sur un ConfirmButton (armer puis confirmer). */
async function confirmer(page: Page, testId: string, dans?: Locator) {
  const bouton = (dans ?? page).getByTestId(testId);
  await bouton.click();
  await expect(bouton).toHaveAttribute("data-armed", "true");
  await bouton.click();
}

/** Lignes du journal portant exactement cette action (le badge, pas le texte des détails). */
function avecAction(lignes: Locator, action: string) {
  return lignes.filter({ has: lignes.page().locator(`[data-statut="${action}"]`) });
}

/** Filet de sécurité : Hamid Naciri doit rester actif pour les specs suivantes. */
async function reactiverHamid(page: Page) {
  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: "Hamid Naciri" }).click();
  await expect(page.getByRole("heading", { name: "Hamid Naciri" })).toBeVisible();
  const reactiver = page.getByRole("button", { name: "Réactiver" });
  if (await reactiver.isVisible().catch(() => false)) {
    await reactiver.click();
    await expect(page.getByTestId("etat-compte")).toHaveCount(0);
  }
}

test.describe("Suppression douce d'un client, annulation, journal", () => {
  const nom = `Suppr${SUFFIXE}`;

  test("suppression → disparaît de la liste → « Annuler » dans le toast → réapparaît ; le journal trace les deux", async ({ page }) => {
    await login(page, "COM1");
    await creerClient(page, nom, "Test");

    await page.goto("/dashboard/clients");
    await page.getByRole("link", { name: `Test ${nom}` }).click();
    await expect(page.getByRole("heading", { name: `Test ${nom}` })).toBeVisible();
    // Aucune vente en cours : la suppression est possible
    await expect(page.getByTestId("vente-en-cours")).toHaveCount(0);
    await confirmer(page, "bouton-supprimer");

    // La fiche reste ouverte avec le badge et le bandeau ; le toast propose « Annuler » (8 s)
    await expect(page.getByTestId("etat-compte")).toHaveText("(compte supprimé)");
    await expect(page.getByTestId("bandeau-supprime")).toBeVisible();
    const toast = page.getByTestId("toast").filter({ hasText: "Compte supprimé" });
    await expect(toast).toBeVisible();

    // La liste active ne montre plus le client, un lien mène aux comptes supprimés ; le toast survit à la navigation
    await page.getByRole("navigation", { name: "Fil d'Ariane" }).getByRole("link", { name: "Clients" }).click();
    await expect(page).toHaveURL(/\/dashboard\/clients$/);
    await expect(page.getByRole("link", { name: `Test ${nom}` })).toHaveCount(0);
    await expect(page.getByTestId("voir-supprimes")).toBeVisible();
    await toast.getByTestId("toast-action").click();
    await expect(page.getByTestId("toast").filter({ hasText: "Action annulée" })).toBeVisible();
    await expect(page.getByRole("link", { name: `Test ${nom}` })).toBeVisible();

    // Journal : suppression puis restauration, avec l'acteur
    await login(page, "DIRCOM");
    await page.goto("/dashboard/journal");
    const lignes = page.getByTestId("journal-ligne").filter({ hasText: `Test ${nom}` });
    await expect(avecAction(lignes, "SUPPRESSION")).toHaveCount(1);
    await expect(avecAction(lignes, "RESTAURATION")).toHaveCount(1);
    await expect(avecAction(lignes, "CREATION")).toHaveCount(1);
    await expect(lignes.first()).toContainText("Youssef Idrissi");

    // Filtre par type d'action : seules les suppressions restent
    await page.getByRole("navigation", { name: "Type d'action" }).getByRole("link", { name: "Suppression" }).click();
    await expect(page).toHaveURL(/action=SUPPRESSION/);
    await expect(avecAction(page.getByTestId("journal-ligne"), "RESTAURATION")).toHaveCount(0);
    await expect(page.getByTestId("journal-ligne").filter({ hasText: `Test ${nom}` })).toHaveCount(1);
  });

  test("un commercial ne peut pas agir sur le client d'un autre commercial", async ({ page }) => {
    await login(page, "COM2");
    // Hamid Naciri est géré par COM1 : la fiche n'est pas accessible à COM2 (404 de l'espace)
    await page.goto("/dashboard/clients");
    await expect(page.getByRole("link", { name: "Hamid Naciri" })).toHaveCount(0);
  });
});

test.describe("Suspension d'un client avec vente en cours", () => {
  test.afterEach(async ({ page }) => {
    await reactiverHamid(page);
  });

  test("suppression bloquée, suspension possible, badge partout, connexion refusée, réactivation", async ({ page }) => {
    await login(page, "COM1");
    await page.goto("/dashboard/clients");
    await page.getByRole("link", { name: "Hamid Naciri" }).click();

    // Vente en cours : Supprimer est désactivé, Suspendre reste possible
    await expect(page.getByTestId("vente-en-cours")).toBeVisible();
    await expect(page.getByTestId("bouton-supprimer")).toBeDisabled();
    await confirmer(page, "bouton-suspendre");
    await expect(page.getByTestId("etat-compte")).toHaveText("(suspendu)");
    await expect(page.getByRole("button", { name: "Réactiver" })).toBeVisible();

    // Les données historiques restent affichées ailleurs, avec le badge (contrat côté Responsable Administratif)
    await login(page, "RESPADM");
    await page.goto("/dashboard/contrats");
    const ligne = page.locator("table tbody tr", { hasText: "Appartement A01" });
    await expect(ligne.getByText("Hamid Naciri")).toBeVisible();
    await expect(ligne.getByTestId("etat-compte")).toHaveText("(suspendu)");

    // Le client ne peut plus se connecter
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Identifiant").fill("CL-DEMO");
    await page.getByLabel("Mot de passe").fill("demo1234");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText(/Ce compte a été désactivé/)).toBeVisible();

    // Réactivation depuis la fiche : le badge disparaît, le client se connecte à nouveau
    await login(page, "COM1");
    await page.goto("/dashboard/clients");
    await page.getByRole("link", { name: "Hamid Naciri" }).click();
    await page.getByRole("button", { name: "Réactiver" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Compte réactivé" })).toBeVisible();
    await expect(page.getByTestId("etat-compte")).toHaveCount(0);
    await login(page, "CLIENT");
    await expect(page.getByRole("heading", { name: "Appartement A01" })).toBeVisible();
  });
});

test.describe("Comptes internes (Équipe)", () => {
  const nom = `Recrue${SUFFIXE}`;

  test("suspension puis suppression d'une recrue, comptes supprimés, réactivation, journal", async ({ page }) => {
    await login(page, "DIRCOM");
    await page.goto("/dashboard/equipe");
    await page.getByLabel("Nom", { exact: true }).fill(nom);
    await page.getByLabel("Prénom").fill("Test");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await expect(page.getByText(/Compte .* créé/)).toBeVisible();

    await page.goto("/dashboard/equipe");
    const ligne = page.getByTestId("membre-ligne").filter({ hasText: `Test ${nom}` });
    await expect(ligne).toHaveCount(1);

    // Suspension : badge et bouton Réactiver ; le toast propose d'annuler
    await confirmer(page, "bouton-suspendre", ligne);
    await expect(ligne.getByTestId("etat-compte")).toHaveText("(suspendu)");
    await expect(page.getByTestId("toast").filter({ hasText: "Compte suspendu" }).getByTestId("toast-action")).toBeVisible();
    await ligne.getByRole("button", { name: "Réactiver" }).click();
    await expect(ligne.getByTestId("etat-compte")).toHaveCount(0);

    // Suppression : sort de la liste, visible dans « comptes supprimés », réactivable
    await confirmer(page, "bouton-supprimer", ligne);
    await expect(page.getByTestId("membre-ligne").filter({ hasText: `Test ${nom}` })).toHaveCount(0);
    await page.getByTestId("voir-supprimes").click();
    const supprimee = page.getByTestId("membre-ligne").filter({ hasText: `Test ${nom}` });
    await expect(supprimee.getByTestId("etat-compte")).toHaveText("(compte supprimé)");
    await supprimee.getByRole("button", { name: "Réactiver" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Compte réactivé" })).toBeVisible();

    // Journal : création, suspension, restauration ×2, suppression
    await page.goto("/dashboard/journal?periode=jour");
    const lignes = page.getByTestId("journal-ligne").filter({ hasText: `Test ${nom}` });
    await expect(avecAction(lignes, "CREATION")).toHaveCount(1);
    await expect(avecAction(lignes, "SUSPENSION")).toHaveCount(1);
    await expect(avecAction(lignes, "SUPPRESSION")).toHaveCount(1);
    await expect(avecAction(lignes, "RESTAURATION")).toHaveCount(2);
  });

  test("le Directeur Financier ne voit pas les comptes du pôle commercial et le PDG lit le journal sans y agir", async ({ page }) => {
    await login(page, "DIRFIN");
    await page.goto("/dashboard/equipe");
    await expect(page.getByTestId("membre-ligne").filter({ hasText: "Youssef Idrissi" })).toHaveCount(0);

    await login(page, "PDG");
    await page.goto("/dashboard/journal");
    await expect(page.getByRole("heading", { name: "Journal d'activité" })).toBeVisible();
    await expect(page.getByTestId("actions-compte")).toHaveCount(0);
    await page.goto("/dashboard/equipe");
    await expect(page).toHaveURL(/erreur=acces-refuse/);
  });
});
