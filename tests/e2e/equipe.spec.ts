import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const POLE_COMMERCIAL = [
  "Commercial",
  "Responsable Commercial",
  "Responsable Administratif",
  "Assistant Administratif",
  "Service Après-Vente",
];
const POLE_FINANCIER = ["Comptable Interne", "Recouvrement"];

async function statutsProposes(page: import("@playwright/test").Page) {
  return page.locator('select[name="role"] option').allTextContents();
}

test.describe("Hiérarchie de recrutement", () => {
  test("le Directeur Commercial ne voit que son pôle", async ({ page }) => {
    await login(page, "DIRCOM");
    await page.goto("/dashboard/equipe");
    expect(await statutsProposes(page)).toEqual(POLE_COMMERCIAL);
    // La liste des membres ne contient que des rôles du pôle
    const roles = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
    for (const r of roles) expect(POLE_COMMERCIAL).toContain(r.trim());
    expect(roles).not.toContain("Comptable Interne");
  });

  test("le Directeur Financier ne voit que son pôle", async ({ page }) => {
    await login(page, "DIRFIN");
    await page.goto("/dashboard/equipe");
    expect(await statutsProposes(page)).toEqual(POLE_FINANCIER);
    const roles = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
    for (const r of roles) expect(POLE_FINANCIER).toContain(r.trim());
  });

  test("un rôle hors pôle forcé dans le formulaire est refusé par le serveur", async ({ page }) => {
    await login(page, "DIRFIN");
    await page.goto("/dashboard/equipe");
    // On injecte une option interdite dans le <select> et on la sélectionne
    await page.locator('select[name="role"]').evaluate((el) => {
      const sel = el as HTMLSelectElement;
      const opt = document.createElement("option");
      opt.value = "COMMERCIAL";
      opt.textContent = "forgé";
      sel.appendChild(opt);
      sel.value = "COMMERCIAL";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.getByLabel("Nom", { exact: true }).fill("Forge");
    await page.getByLabel("Prénom").fill("Test");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await expect(page.getByText("Vous ne pouvez créer que les rôles de votre pôle")).toBeVisible();
    await expect(page.getByText(/Compte .* créé/)).toHaveCount(0);
  });
});
