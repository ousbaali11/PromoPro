import { expect, test, type Locator, type Page } from "@playwright/test";
import { login, classeurXlsx } from "./helpers";

/*
 * 10.1 — Import Excel des prospects par l'Assistant Administratif et
 * répartition équilibrée entre les commerciaux. Les classeurs sont générés à
 * la volée (SheetJS), rien n'est committé en binaire.
 *
 * Seed : Youssef Idrissi et Imane Tazi ont chacun 1 prospect non contacté (plus
 * les commerciaux recrutés par equipe.spec, à 0). Le lot 1 importe 1 prospect ;
 * avant le lot 2, on s'assure que les charges diffèrent, puis 10 prospects
 * doivent ramener l'écart à 1 au plus.
 */

async function ouvrirImport(page: Page) {
  await login(page, "ASSIST");
  await page.goto("/dashboard/prospects");
  await page.getByTestId("bouton-import").click();
  await expect(page.getByTestId("panneau-import")).toBeVisible();
}

async function analyser(page: Page, fichier: ReturnType<typeof classeurXlsx>) {
  await page.getByTestId("fichier-import").setInputFiles(fichier);
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByTestId("import-apercu")).toBeVisible();
}

async function lireTotaux(items: Locator) {
  const totaux = await items.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.total)));
  return { totaux, ecart: Math.max(...totaux) - Math.min(...totaux) };
}

async function lireCharges(page: Page) {
  const cartes = page.getByTestId("commercial-carte");
  await expect(cartes.first()).toBeVisible();
  return cartes.evaluateAll((els) =>
    els.map((e) => ({ id: (e as HTMLElement).dataset.commercialId!, restants: Number((e as HTMLElement).dataset.restants), nom: e.textContent ?? "" })),
  );
}

test("lot 1 : lignes invalides ignorées avec motif, 1 prospect importé chez le moins chargé", async ({ page }) => {
  await ouvrirImport(page);
  const chargesAvant = await lireCharges(page);
  expect(chargesAvant.length).toBeGreaterThanOrEqual(2);

  await analyser(
    page,
    classeurXlsx(
      [
        { Nom: "Prospect Zéro E2E", Téléphone: "06 00 00 00 01", Source: "Avito" },
        { Nom: "Sans téléphone E2E", Téléphone: "", Source: "Avito" },
        { Nom: "Doublon E2E", Téléphone: "0600000001", Source: "Mubawab" },
      ],
      "lot-1.xlsx",
    ),
  );
  await expect(page.getByTestId("apercu-valides")).toHaveText("1 prospect valide");
  await expect(page.getByTestId("apercu-ignorees")).toHaveText("2 lignes ignorées");
  const motifs = page.getByTestId("apercu-motifs");
  await expect(motifs).toContainText("Ligne 3 : téléphone vide");
  await expect(motifs).toContainText("Ligne 4 : doublon du téléphone de la ligne 2");

  // Rien n'est écrit à ce stade : le tableau ne contient pas encore le prospect
  await expect(page.getByTestId("prospect-ligne").filter({ hasText: "Prospect Zéro E2E" })).toHaveCount(0);
  const apercu = page.getByTestId("apercu-commercial");
  const avant = await lireTotaux(apercu);
  expect(avant.totaux.reduce((s, t) => s + t, 0)).toBe(chargesAvant.reduce((s, c) => s + c.restants, 0) + 1);

  await page.getByTestId("confirmer-import").click();
  await expect(page.getByTestId("import-succes")).toContainText("1 prospect importé (2 lignes ignorées)");
  await expect(page.getByTestId("prospect-ligne").filter({ hasText: "Prospect Zéro E2E" })).toHaveCount(1);
  const chargesApres = await lireCharges(page);
  expect(chargesApres.reduce((s, c) => s + c.restants, 0)).toBe(chargesAvant.reduce((s, c) => s + c.restants, 0) + 1);
});

test("lot 2 : 10 prospects, en-têtes dans un autre ordre, écart final ≤ 1 dans l'aperçu puis sur la page, commercial notifié", async ({ page }) => {
  // Charges de départ différentes : si le lot 1 a laissé tout le monde à égalité (cela dépend du nombre
  // de commerciaux recrutés par les specs précédentes), Youssef traite un de ses prospects.
  await ouvrirImport(page);
  let chargesAvant = await lireCharges(page);
  const ecart0 = (charges: { restants: number }[]) => Math.max(...charges.map((c) => c.restants)) - Math.min(...charges.map((c) => c.restants));
  if (ecart0(chargesAvant) === 0) {
    await login(page, "COM1");
    await page.goto("/dashboard/prospects");
    const ligne = page.getByTestId("prospect-ligne").filter({ has: page.getByRole("button", { name: "Contacté" }) }).first();
    const nomTraite = (await ligne.locator("td").first().innerText()).trim();
    await ligne.getByRole("button", { name: "Contacté" }).click();
    // Une fois traitée, la ligne n'a plus de bouton « Contacté » : on la retrouve par son nom
    await expect(page.getByTestId("prospect-ligne").filter({ hasText: nomTraite }).locator('[data-statut="CONTACTE"]')).toBeVisible();
    await ouvrirImport(page);
    chargesAvant = await lireCharges(page);
  }
  expect(ecart0(chargesAvant)).toBeGreaterThanOrEqual(1);

  const lignes = Array.from({ length: 10 }, (_, i) => ({
    SOURCE: i % 2 ? "Avito" : "Mubawab",
    telephone: `06 10 00 00 ${String(i + 10).padStart(2, "0")}`,
    NOM: `Import E2E ${String(i + 1).padStart(2, "0")}`, // « 01 »… « 10 » : aucun nom préfixe d'un autre
  }));
  await analyser(page, classeurXlsx(lignes, "lot-2.xlsx"));
  await expect(page.getByTestId("apercu-valides")).toHaveText("10 prospects valides");
  await expect(page.getByTestId("apercu-ignorees")).toHaveText("0 ligne ignorée");

  // Aperçu : total attribué = 10, écart final ≤ 1, charges initiales = celles des cartes
  const apercu = page.getByTestId("apercu-commercial");
  const { totaux, ecart } = await lireTotaux(apercu);
  expect(ecart).toBeLessThanOrEqual(1);
  const nouveaux = await apercu.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.nouveaux)));
  expect(nouveaux.reduce((s, n) => s + n, 0)).toBe(10);
  expect(totaux.reduce((s, t) => s + t, 0)).toBe(chargesAvant.reduce((s, c) => s + c.restants, 0) + 10);

  // Qui reçoit quoi : les noms attribués à Youssef Idrissi d'après l'aperçu
  const blocYoussef = apercu.filter({ hasText: "Youssef Idrissi" });
  const nomsYoussef = await blocYoussef.getByTestId("apercu-attribue").allTextContents();
  const nbYoussef = Number(await blocYoussef.getAttribute("data-nouveaux"));
  expect(nomsYoussef.map((n) => n.replace(/^, /, "")).length).toBe(nbYoussef);

  await page.getByTestId("confirmer-import").click();
  await expect(page.getByTestId("import-succes")).toContainText("10 prospects importés");

  // En base (cartes de la page, rafraîchies avec le tableau) : mêmes totaux que l'aperçu, écart ≤ 1
  await expect(page.getByTestId("prospect-ligne").filter({ hasText: "Import E2E" })).toHaveCount(10);
  const chargesApres = await lireCharges(page);
  const ecartApres = Math.max(...chargesApres.map((c) => c.restants)) - Math.min(...chargesApres.map((c) => c.restants));
  expect(ecartApres).toBeLessThanOrEqual(1);
  expect(chargesApres.map((c) => c.restants).sort()).toEqual([...totaux].sort());

  // Côté commercial : notification et prospects sur son compte, statut « Non contacté »
  await login(page, "COM1");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Nouveaux prospects attribués").first()).toBeVisible();
  await expect(page.getByText(new RegExp(`${nbYoussef} nouveau`)).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/dashboard/prospects");
  for (const nom of nomsYoussef.map((n) => n.replace(/^, /, ""))) {
    const ligne = page.getByTestId("prospect-ligne").filter({ hasText: nom });
    await expect(ligne).toHaveCount(1);
    await expect(ligne.locator('[data-statut="NON_CONTACTE"]')).toBeVisible();
  }
  await expect(page.getByTestId("prospect-ligne").filter({ hasText: "Import E2E" })).toHaveCount(nbYoussef);

  // Journal : l'import est tracé au nom de l'assistante
  await login(page, "PDG");
  await page.goto("/dashboard/journal?periode=jour");
  const ligneJournal = page.getByTestId("journal-ligne").filter({ hasText: "10 prospects importés (lot-2.xlsx)" });
  await expect(ligneJournal).toHaveCount(1);
  await expect(ligneJournal).toContainText("Hicham Berrada");
});
