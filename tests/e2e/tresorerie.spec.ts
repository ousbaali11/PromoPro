import { expect, test, type Page } from "@playwright/test";
import { login, hrefBienStaff, ymd } from "./helpers";

/*
 * Trésorerie prévisionnelle : projection à 30 / 60 / 90 jours des échéances
 * connues des ventes en cours, en barres empilées, clairement théorique.
 * Le test crée une vente (Appartement B01) dont l'échéancier tombe dans les
 * trois fenêtres et vérifie que chaque fenêtre augmente du montant attendu.
 * Nommé « tresorerie » pour jouer après recouvrement.spec (qui compte les
 * tranches du seul Appartement A01) et avant vente.spec.
 */
const PRIX_B01 = 1_050_000;
const plusJours = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function lireProjection(page: Page) {
  await login(page, "DIRFIN");
  await page.goto("/dashboard/finance");
  const bloc = page.getByTestId("section-projection").getByTestId("projection-tresorerie");
  await expect(bloc).toBeVisible();
  const total = Number(await bloc.getAttribute("data-total"));
  const fenetres = bloc.getByTestId("projection-fenetre");
  const totaux = (await fenetres.count()) === 3 ? await fenetres.evaluateAll((els) => els.map((e) => Number((e as SVGElement).dataset.total))) : [0, 0, 0];
  return { total, totaux };
}

test("projection : avertissement théorique, une vente avec échéances à J+0 / +20 / +50 / +80 alimente les trois fenêtres", async ({ page }) => {
  const avant = await lireProjection(page);
  const section = page.getByTestId("section-projection");
  await expect(section.getByRole("heading", { name: "Projection à 30, 60 et 90 jours" })).toBeVisible();
  await expect(section.getByTestId("projection-avertissement")).toContainText("Projection théorique");
  await expect(section.getByTestId("projection-avertissement")).toContainText("retards de paiement réels ne sont pas anticipés");

  // Vente de B01 : 40 % aujourd'hui, puis 20 % à +20, +50 et +80 jours
  await login(page, "COM1");
  const href = await hrefBienStaff(page, "Appartement B01");
  await page.goto(href);
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('form[data-hydrated="true"]').first().waitFor();
  await page.locator('select[name="clientId"]').evaluate((el) => {
    const sel = el as HTMLSelectElement;
    const opt = [...sel.options].find((o) => o.textContent?.includes("Naciri"));
    if (!opt) throw new Error("Client de démo introuvable");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  for (const [n, jours] of [
    [1, 0],
    [2, 20],
    [3, 50],
    [4, 80],
  ] as const) {
    await page.locator(`#tranche${n}Date`).fill(ymd(plusJours(jours)));
  }
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: "Appartement B01" });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();

  // Chaque fenêtre augmente exactement des tranches attendues : 40 % + 20 % / 20 % / 20 %
  const apres = await lireProjection(page);
  const attendu = [Math.round(PRIX_B01 * 0.6), Math.round(PRIX_B01 * 0.2), Math.round(PRIX_B01 * 0.2)];
  expect(apres.totaux.map((t, i) => t - avant.totaux[i])).toEqual(attendu);
  expect(apres.total - avant.total).toBe(attendu.reduce((s, x) => s + x, 0));

  const bloc = page.getByTestId("projection-tresorerie");
  await expect(bloc.getByRole("img", { name: /empilés par projet/ })).toBeVisible();
  const libelles = await bloc.getByTestId("projection-fenetre").evaluateAll((els) => els.map((e) => (e as SVGElement).dataset.fenetre));
  expect(libelles).toEqual(["0–30 j", "31–60 j", "61–90 j"]);
  await expect(bloc.getByRole("list", { name: "Légende par projet" })).toContainText("Résidence Al Manar");
  await expect(bloc.getByTestId("projection-tableau").locator("tbody tr")).toHaveCount(3);
});

test("la projection est réservée à la trésorerie : le PDG y accède, un commercial est redirigé", async ({ page }) => {
  await login(page, "PDG");
  await page.goto("/dashboard/finance");
  await expect(page.getByTestId("section-projection")).toBeVisible();
  await login(page, "COM1");
  await page.goto("/dashboard/finance");
  await expect(page).toHaveURL(/\/dashboard\?erreur=acces-refuse$/);
});
