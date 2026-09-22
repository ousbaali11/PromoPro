import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Workflow de vente de bout en bout :
 * Directeur Commercial crée un projet et deux biens → PDG bloque le second
 * avec un commentaire → Commercial envoie une proposition sur le premier →
 * PDG l'accepte → le bien passe à « Vendu » → le commercial est notifié.
 */
test("workflow de vente : projet → blocage → proposition → acceptation → vendu → notification", async ({ page }) => {
  const suffixe = Date.now().toString(36).toUpperCase();
  const lotA = `E2E Lot A ${suffixe}`;
  const lotB = `E2E Lot B ${suffixe}`;

  // 1. Directeur Commercial : projet + deux biens
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets/nouveau");
  await page.getByLabel("Nom du projet").fill(`E2E Résidence ${suffixe}`);
  await page.getByLabel(/Nom du compte/).fill("SCI E2E");
  await page.getByLabel(/IBAN/).fill("MA00 1111 2222 3333 4444 5555");
  await page.getByRole("button", { name: /Créer le projet/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);

  for (const designation of [lotA, lotB]) {
    await page.getByTestId("form-ajout-bien").getByLabel("Désignation").fill(designation);
    await page.getByTestId("form-ajout-bien").getByLabel(/Prix/).fill("500000");
    await page.getByTestId("form-ajout-bien").getByLabel(/Surface/).fill("60");
    await page.getByRole("button", { name: "Ajouter le bien" }).click();
    await expect(page.getByRole("link", { name: designation })).toBeVisible();
  }
  const hrefA = await page.getByRole("link", { name: lotA }).getAttribute("href");
  const hrefB = await page.getByRole("link", { name: lotB }).getAttribute("href");
  expect(hrefA).toMatch(/\/dashboard\/biens\//);
  expect(hrefB).toMatch(/\/dashboard\/biens\//);

  // 2. PDG : blocage du lot B avec commentaire privé
  await login(page, "PDG");
  await page.goto(hrefB!);
  await page.getByLabel(/Commentaire/).fill("Réservé E2E");
  await page.getByRole("button", { name: "Bloquer ce bien" }).click();
  await expect(page.getByText("Bloqué par le PDG")).toBeVisible();
  await expect(page.getByText("Réservé E2E")).toBeVisible();

  // 3. Commercial : proposition sur le lot A pour le client de démo
  await login(page, "COM1");
  await page.goto(hrefA!);
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions\/nouvelle\?bienId=/);
  await page.locator('select[name="clientId"]').evaluate((el) => {
    const sel = el as HTMLSelectElement;
    const opt = [...sel.options].find((o) => o.textContent?.includes("Naciri"));
    if (!opt) throw new Error("Client de démo introuvable dans la liste");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
  await expect(page.getByText(lotA)).toBeVisible();

  // 4. PDG : acceptation
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: lotA });
  await expect(carte).toHaveCount(1);
  await expect(carte.getByText("En attente")).toBeVisible();
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();

  // 5. Le bien est « Vendu »
  await page.goto(hrefA!);
  await expect(page.getByText("Vendu", { exact: true })).toBeVisible();
  await expect(page.getByText("Hamid Naciri")).toBeVisible();

  // 6. Le commercial reçoit « Affaire concrétisée »
  await login(page, "COM1");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Affaire concrétisée").first()).toBeVisible();
  await expect(page.getByText(lotA).first()).toBeVisible();
});
