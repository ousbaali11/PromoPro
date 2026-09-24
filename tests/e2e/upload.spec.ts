import { expect, test } from "@playwright/test";
import { deposerFichier, fichierDeTest, hrefBienStaff, login, ouvrirBienClient } from "./helpers";

/*
 * Dépôt de fichiers (incident de production du 24 septembre 2026 : l'envoi
 * d'une preuve de paiement affichait « Unexpected end of JSON input », le
 * serveur ayant planté sur EACCES mkdir dans UPLOAD_DIR et renvoyé un 500
 * sans corps). Deux garanties, sur le formulaire « Preuve de paiement » :
 *  - la taille est jugée avant tout transfert et les fichiers proches de la
 *    limite (photo de téléphone, 10 Mo exactement) passent ;
 *  - quelle que soit la réponse du serveur (vide, HTML, JSON d'erreur), le
 *    message affiché est compréhensible, jamais l'erreur technique brute, et
 *    le dépôt reprend dès que le serveur répond à nouveau.
 * La panne serveur est simulée au niveau réseau (page.route) : le contrat
 * « toujours du JSON » de la route elle-même est vérifié par le test unitaire
 * tests/unit/upload-route.test.ts (échec d'écriture réel, erreur inattendue).
 */
const MO = 1024 * 1024;
const MESSAGE_GENERIQUE = "Le fichier n'a pas pu être envoyé, réessayez ou contactez le support.";
const MESSAGE_STOCKAGE = "Le stockage des fichiers est temporairement indisponible, contactez l'administrateur.";

/** JPEG factice de la taille voulue : signature FF D8 FF puis remplissage (le serveur ne vérifie que la signature). */
function jpeg(taille: number) {
  const b = Buffer.alloc(taille, 0x20);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xe0;
  return b;
}

test("preuve de paiement : 10 Mo + 1 refusé sans transfert, 10 Mo exactement et photo de téléphone de 8 Mo acceptés", async ({ page }) => {
  await login(page, "COM1");
  await page.goto(await hrefBienStaff(page, "Appartement A01"));
  const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
  await expect(form).toBeVisible();
  const requetes: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/upload")) requetes.push(r.url());
  });

  // Juste au-dessus de la limite : message immédiat, aucune requête envoyée, aucun chemin retenu
  await form.locator('input[type="file"]').first().setInputFiles({ name: "photo-trop-grande.jpg", mimeType: "image/jpeg", buffer: jpeg(10 * MO + 1) });
  await expect(form.getByTestId("upload-erreur")).toHaveText("Fichier trop volumineux (10 Mo maximum).");
  expect(requetes).toHaveLength(0);
  await expect(form.locator('input[type="hidden"][name="preuveUrl"]')).toHaveValue("");

  // Exactement 10 Mo : accepté, le type est annoncé dans l'URL pour le contrôle précoce côté serveur
  await deposerFichier(form, "preuveUrl", [{ name: "photo-10mo.jpg", buffer: jpeg(10 * MO) }]);
  expect(requetes).toHaveLength(1);
  expect(requetes[0]).toContain("/api/upload?type=preuves-paiement");
  await expect(form.getByTestId("upload-erreur")).toHaveCount(0);

  // Une photo de téléphone récente (8 Mo) après avoir retiré la précédente
  await form.getByRole("button", { name: "Retirer le fichier" }).click();
  await deposerFichier(form, "preuveUrl", [{ name: "IMG_20260924_101500.jpg", buffer: jpeg(8 * MO) }]);
  expect(requetes).toHaveLength(2);
  await expect(form.getByText("IMG_20260924_101500.jpg")).toBeVisible();
});

test("panne serveur simulée sur /api/upload (client, preuve de paiement) : message propre, jamais l'erreur JSON brute, et reprise ensuite", async ({ page }) => {
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  await page.getByRole("button", { name: "Ajouter un paiement" }).click();
  const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
  const input = form.locator('input[type="file"]').first();
  const erreur = form.getByTestId("upload-erreur");
  const cache = form.locator('input[type="hidden"][name="preuveUrl"]');

  const cas: { nom: string; reponse: Parameters<import("@playwright/test").Route["fulfill"]>[0]; attendu: string }[] = [
    { nom: "500 sans corps (le plantage d'origine)", reponse: { status: 500, body: "" }, attendu: MESSAGE_GENERIQUE },
    { nom: "page HTML d'un proxy", reponse: { status: 502, contentType: "text/html", body: "<html><body><h1>502 Bad Gateway</h1></body></html>" }, attendu: MESSAGE_GENERIQUE },
    { nom: "JSON tronqué", reponse: { status: 200, contentType: "application/json", body: '{"path":' }, attendu: MESSAGE_GENERIQUE },
    { nom: "503 stockage indisponible (réponse de la route quand le volume refuse l'écriture)", reponse: { status: 503, contentType: "application/json", body: JSON.stringify({ error: MESSAGE_STOCKAGE }) }, attendu: MESSAGE_STOCKAGE },
  ];
  for (const c of cas) {
    await page.unroute("**/api/upload*");
    await page.route("**/api/upload*", (route) => route.fulfill(c.reponse));
    await input.setInputFiles(fichierDeTest("preuve.png"));
    await expect(erreur, c.nom).toHaveText(c.attendu);
    expect(await erreur.textContent(), c.nom).not.toMatch(/JSON|Unexpected|token|<html/i);
    await expect(cache, c.nom).toHaveValue("");
  }

  // Le serveur répond à nouveau : le dépôt réel réussit et le message disparaît
  await page.unroute("**/api/upload*");
  await deposerFichier(form, "preuveUrl", [{ name: "preuve-reprise.png" }]);
  await expect(erreur).toHaveCount(0);
  await expect(form.getByText("preuve-reprise.png")).toBeVisible();
});
