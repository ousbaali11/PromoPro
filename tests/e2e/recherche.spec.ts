import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/*
 * Recherche globale du dashboard : raccourci Ctrl+K, résultats groupés par
 * type (biens, clients, projets) avec lien vers la fiche, cloisonnement par
 * rôle (un commercial ne voit que ses clients). Le cloisonnement entre
 * promoteurs est couvert par isolation.spec.ts.
 */
test("Ctrl+K ouvre la recherche ; « A01 » trouve le bien, « naciri » le client, « manar » le projet ; le lien mène à la fiche", async ({ page }) => {
  await login(page, "PDG");
  await page.keyboard.press("Control+k");
  const dialogue = page.getByRole("dialog", { name: "Recherche" });
  await expect(dialogue).toBeVisible();
  const champ = dialogue.getByTestId("champ-recherche");
  await expect(champ).toBeFocused();

  await champ.fill("a");
  await expect(dialogue.getByText("Saisissez au moins 2 caractères.")).toBeVisible();

  await champ.fill("A01");
  const biens = dialogue.getByTestId("groupe-bien");
  await expect(biens.getByTestId("resultat-recherche").filter({ hasText: "Appartement A01" })).toHaveCount(1);
  await expect(dialogue.getByTestId("groupe-client")).toHaveCount(0);

  await champ.fill("naciri");
  await expect(dialogue.getByTestId("groupe-client").getByTestId("resultat-recherche").filter({ hasText: "Hamid Naciri" })).toHaveCount(1);
  await expect(dialogue.getByTestId("groupe-bien")).toHaveCount(0);

  await champ.fill("manar");
  const projet = dialogue.getByTestId("groupe-projet").getByTestId("resultat-recherche").filter({ hasText: "Résidence Al Manar" });
  await expect(projet).toHaveCount(1);
  await champ.fill("zzzz-inexistant");
  await expect(dialogue.getByTestId("recherche-vide")).toBeVisible();

  await champ.fill("A01");
  await biens.getByTestId("resultat-recherche").filter({ hasText: "Appartement A01" }).click();
  await expect(page).toHaveURL(/\/dashboard\/biens\/[^/]+$/);
  await expect(dialogue).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Appartement A01" })).toBeVisible();
});

test("le bouton de l'en-tête ouvre la même recherche ; Échap la ferme et rend le focus au bouton", async ({ page }) => {
  await login(page, "DIRCOM");
  const bouton = page.getByTestId("ouvrir-recherche");
  await bouton.click();
  const dialogue = page.getByRole("dialog", { name: "Recherche" });
  await expect(dialogue).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogue).toHaveCount(0);
  await expect(bouton).toBeFocused();
});

test("un commercial ne trouve que ses propres clients ; la route refuse un appel sans session", async ({ page }) => {
  await login(page, "COM2");
  const r = await page.request.get("/api/recherche?q=naciri");
  expect(r.status()).toBe(200);
  expect((await r.json()).groupes).toEqual([]); // Hamid Naciri est géré par COM1
  const biens = await page.request.get("/api/recherche?q=a01");
  expect((await biens.json()).groupes.map((g: { type: string }) => g.type)).toEqual(["bien"]); // les biens du promoteur restent visibles

  await page.context().clearCookies();
  expect((await page.request.get("/api/recherche?q=naciri")).status()).toBe(401);
});
