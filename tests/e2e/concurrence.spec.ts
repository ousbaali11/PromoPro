import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, loginAvec, hrefBienStaff, deposerFichier, COMPTES } from "./helpers";

/*
 * Concurrence (audit, phase 5) :
 * 1. deux commerciaux envoient une proposition sur le même bien au même
 *    instant → un seul réussit, l'autre reçoit « n'est plus disponible »,
 *    une seule proposition active ;
 * 2. le PDG décide deux fois (double clic, onglet obsolète) et un désistement
 *    est enregistré entre-temps → chaque tentative tardive reçoit un message,
 *    aucun état incohérent (une proposition, un contrat, bien cohérent).
 * Joué sur le Parking P01 (rendu disponible à la fin par le désistement).
 */
test.describe.configure({ mode: "serial" });

let hrefP01 = "";
let gagnant: "COM1" | "COM2" = "COM1";

async function ouvrirFormulaire(browser: Browser, compte: keyof typeof COMPTES) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await loginAvec(page, COMPTES[compte].identifiant, COMPTES[compte].mdp, COMPTES[compte].atterrissage);
  await page.goto(hrefP01);
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('form[data-hydrated="true"]').first().waitFor();
  await page.locator('select[name="clientId"]').evaluate((el) => {
    const sel = el as HTMLSelectElement;
    const opt = [...sel.options].find((o) => o.textContent?.includes("Naciri"));
    if (!opt) throw new Error("Client de démo introuvable");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return { ctx, page };
}

async function resultat(page: Page) {
  await expect
    .poll(async () => {
      if (/\/dashboard\/propositions$/.test(page.url())) return "envoyee";
      // Selon l'instant de la collision : refus par la lecture initiale du statut, ou par la réservation atomique
      if ((await page.getByText(/Ce bien n'est plus disponible/).count()) > 0) return "refusee";
      return "en-attente";
    })
    .not.toBe("en-attente");
  return /\/dashboard\/propositions$/.test(page.url()) ? "envoyee" : "refusee";
}

test("deux propositions simultanées sur le même bien : une seule passe, l'autre reçoit un message clair", async ({ page, browser }) => {
  await login(page, "COM1");
  hrefP01 = await hrefBienStaff(page, "Parking P01");
  const a = await ouvrirFormulaire(browser, "COM1");
  const b = await ouvrirFormulaire(browser, "COM2");

  await Promise.all([
    a.page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click(),
    b.page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click(),
  ]);
  const [ra, rb] = await Promise.all([resultat(a.page), resultat(b.page)]);
  expect([ra, rb].sort()).toEqual(["envoyee", "refusee"]);
  gagnant = ra === "envoyee" ? "COM1" : "COM2";
  await a.ctx.close();
  await b.ctx.close();

  // Une seule proposition sur P01, bien réservé une seule fois
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  await expect(page.locator("[data-card]", { hasText: "Parking P01" })).toHaveCount(1);
  await page.goto(hrefP01);
  await expect(page.getByText("Proposition en cours", { exact: true })).toBeVisible();
});

test("décision du PDG en double (onglet obsolète) puis désistement : messages clairs, un seul contrat, bien cohérent", async ({ page, browser }) => {
  const ctx2 = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const obsolete = await ctx2.newPage();
  await loginAvec(obsolete, COMPTES.PDG.identifiant, COMPTES.PDG.mdp, COMPTES.PDG.atterrissage);
  await obsolete.goto("/dashboard/propositions");
  const carteObsolete = obsolete.locator("[data-card]", { hasText: "Parking P01" });
  await expect(carteObsolete.getByRole("button", { name: "Accepter" })).toBeVisible();

  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: "Parking P01" });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();

  // L'onglet resté sur l'ancienne page tente d'accepter (ou de refuser) à son tour
  await carteObsolete.getByRole("button", { name: "Refuser" }).click();
  await expect(carteObsolete.getByTestId("decision-erreur")).toHaveText("Cette proposition a déjà été traitée.");

  // Un seul contrat pour P01, bien vendu
  await login(page, "RESPADM");
  await page.goto("/dashboard/contrats");
  await expect(page.getByTestId("contrat-ligne").filter({ hasText: "Parking P01" })).toHaveCount(1);

  // Désistement par le commercial gagnant : bien libéré, contrat annulé
  await login(page, gagnant);
  await page.goto(hrefP01);
  await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
  await deposerFichier(form, "documentUrl", [{ name: "desistement-p01.png" }]);
  await form.getByRole("button", { name: "Confirmer le désistement" }).click();
  await expect(page).toHaveURL(/\/dashboard\/desistes$/);
  await page.goto(hrefP01);
  await expect(page.getByText("Disponible", { exact: true })).toBeVisible();

  // Tentative tardive sur l'onglet obsolète après le désistement : message, aucun changement
  await carteObsolete.getByRole("button", { name: "Accepter" }).click();
  await expect(carteObsolete.getByTestId("decision-erreur")).toHaveText("Cette proposition a déjà été traitée.");
  await page.goto(hrefP01);
  await expect(page.getByText("Disponible", { exact: true })).toBeVisible();
  await login(page, "RESPADM");
  await page.goto("/dashboard/desistements");
  const desistement = page.locator("[data-card]", { hasText: "Parking P01" });
  await expect(desistement).toHaveCount(1);
  // Le désistement est traité jusqu'au bout pour ne rien laisser en attente aux specs suivantes
  await desistement.getByRole("button", { name: "Papiers vérifiés" }).click();
  await expect(desistement.getByText("Vérifié — remboursement en cours")).toBeVisible();
  await desistement.getByLabel("Décharge").fill("Test de concurrence : aucun paiement validé, rien à rembourser");
  await desistement.getByRole("button", { name: "Marquer remboursé" }).click();
  await expect(page.locator("section", { hasText: "Historique" }).locator("[data-card]", { hasText: "Parking P01" }).getByText("Remboursé", { exact: true })).toBeVisible();
  await ctx2.close();
});
