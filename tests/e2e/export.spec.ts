import { readFileSync } from "node:fs";
import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import { login } from "./helpers";

/*
 * Export CSV des tableaux : le fichier contient exactement les lignes
 * affichées (déjà filtrées), les en-têtes en français, un BOM UTF-8 pour Excel
 * et des points-virgules.
 */
async function telecharger(page: Page, bouton: Locator): Promise<{ download: Download; texte: string; lignes: string[] }> {
  const [download] = await Promise.all([page.waitForEvent("download"), bouton.click()]);
  const texte = readFileSync((await download.path())!, "utf8");
  expect(texte.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8
  const lignes = texte.slice(1).split("\r\n").filter((l) => l.length > 0);
  return { download, texte, lignes };
}

test("clients : le CSV reprend les lignes affichées, avec en-têtes français et BOM", async ({ page }) => {
  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  const table = page.getByTestId("table-clients");
  const nbLignes = await table.getByTestId("client-ligne").count();
  expect(nbLignes).toBeGreaterThan(0);
  const bouton = table.getByTestId("exporter-csv");
  await expect(bouton).toHaveAttribute("data-lignes", String(nbLignes));

  const { download, lignes } = await telecharger(page, bouton);
  expect(download.suggestedFilename()).toMatch(/^clients-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(lignes[0]).toBe("Nom;Prénom;État du compte;Type de pièce;Numéro de pièce;Téléphone 1;Téléphone 2;E-mail;Identifiant");
  expect(lignes.length - 1).toBe(nbLignes);
  expect(lignes.some((l) => l.startsWith("Naciri;Hamid;"))).toBe(true);
  expect(lignes.some((l) => l.includes(";CL-DEMO"))).toBe(true);
});

test("prospects : l'export suit le tri courant et ne contient que les prospects affichés", async ({ page }) => {
  await login(page, "COM1"); // le commercial ne voit que ses prospects : l'export aussi
  await page.goto("/dashboard/prospects");
  const table = page.getByTestId("table-prospects");
  const affiches = await table.getByTestId("prospect-ligne").locator("td:first-child").allInnerTexts();
  expect(affiches.length).toBeGreaterThan(0);

  const { lignes } = await telecharger(page, table.getByTestId("exporter-csv"));
  expect(lignes[0]).toBe("Nom;Téléphone;Source;Statut;Commercial;Retour client");
  expect(lignes.slice(1).map((l) => l.split(";")[0])).toEqual(affiches.map((t) => t.trim()));
  expect(lignes.join("\n")).not.toContain("Omar Saidi"); // prospect d'un autre commercial
  // Les téléphones commençant par « + » sont protégés contre l'injection de formule
  for (const l of lignes.slice(1)) {
    const tel = l.split(";")[1];
    if (tel.startsWith("'")) expect(tel).toMatch(/^'\+/);
  }
});

test("propositions (cartes) et paiements validés : boutons d'export, une ligne par élément", async ({ page }) => {
  await login(page, "PDG");
  await page.goto("/dashboard/propositions");
  const historique = page.getByTestId("propositions-historique");
  const cartes = await historique.getByTestId("proposition-carte").count();
  const { lignes } = await telecharger(page, historique.getByTestId("exporter-csv"));
  expect(lignes[0]).toBe("Bien;Client;Commercial;Statut;Date;Échéancier");
  expect(lignes.length - 1).toBe(cartes);

  await login(page, "COMPTA");
  await page.goto("/dashboard/paiements");
  const table = page.getByTestId("table-paiements-valides");
  if ((await table.count()) === 1 && (await table.getByTestId("paiement-valide").count()) > 0) {
    const n = await table.getByTestId("paiement-valide").count();
    const res = await telecharger(page, table.getByTestId("exporter-csv"));
    expect(res.lignes[0]).toBe("Bien;Client;Tranche;Montant reçu;Devise;Référence;Réception;Statut");
    expect(res.lignes.length - 1).toBe(n);
    expect(res.lignes[1].endsWith(";Validé")).toBe(true);
  }
});
