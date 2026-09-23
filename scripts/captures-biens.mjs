// Captures d'écran de l'écran de référence (liste des biens d'un projet) pour
// la revue du design system. Usage : node scripts/captures-biens.mjs [baseURL]
// Prérequis : un serveur de dev en mode SQLite (données du seed) sur baseURL.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const dossier = "docs/captures";
mkdirSync(dossier, { recursive: true });

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function login(identifiant, mdp = "demo1234") {
  await page.context().clearCookies();
  await page.goto(`${base}/login`);
  await page.getByLabel("Identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill(mdp);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/dashboard/);
}

async function pageProjet() {
  await page.goto(`${base}/dashboard/projets`);
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await page.waitForURL(/\/dashboard\/projets\/[^/]+$/);
  await page.getByTestId("biens-toolbar").waitFor();
  await page.evaluate(() => localStorage.setItem("promopro.biens.vue", "grille"));
  await page.reload();
  await page.getByTestId("biens-grille").waitFor();
}

// 0. Un plan (image dessinée) sur l'Appartement A01, pour montrer la zone image avec un vrai visuel
await login("DIRCOM-DEMO");
await pageProjet();
const hrefA01 = await page.getByRole("link", { name: "Appartement A01", exact: true }).getAttribute("href");
await page.goto(`${base}${hrefA01}`);
const pngBase64 = await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 800;
  c.height = 600;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f7f6f2";
  ctx.fillRect(0, 0, 800, 600);
  ctx.strokeStyle = "#12283f";
  ctx.lineWidth = 6;
  ctx.strokeRect(60, 60, 680, 480);
  ctx.lineWidth = 3;
  for (const [x1, y1, x2, y2] of [[60, 300, 420, 300], [420, 60, 420, 540], [420, 420, 740, 420], [580, 420, 580, 540]]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = "#35547a";
  ctx.font = "600 22px sans-serif";
  ctx.fillText("Séjour 28 m²", 100, 200);
  ctx.fillText("Chambre 14 m²", 100, 440);
  ctx.fillText("Cuisine 11 m²", 470, 200);
  ctx.fillText("SdB", 470, 500);
  ctx.fillText("Ch. 2", 620, 500);
  return c.toDataURL("image/png").split(",")[1];
});
const formPlan = page.locator("form", { has: page.locator('input[name="plan2dUrl"]') });
await formPlan.locator('input[type="file"]').setInputFiles({ name: "plan-a01.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64") });
await page.waitForFunction(() => (document.querySelector('input[name="plan2dUrl"]')?.value ?? "").startsWith("/api/files/"));
await formPlan.getByRole("button", { name: "Enregistrer le plan" }).click();
await page.getByRole("img", { name: "Plan du bien" }).waitFor();

// 1. Vue grille (Directeur Commercial)
await pageProjet();
await page.waitForTimeout(600);
await page.screenshot({ path: `${dossier}/01-grille.png`, fullPage: false });

// 2. Vue liste
await page.getByTestId("vue-liste").click();
await page.getByTestId("biens-liste").waitFor();
await page.waitForTimeout(700);
await page.screenshot({ path: `${dossier}/02-liste.png`, fullPage: false });

// 3. Survol d'une carte (actions rapides révélées) — côté PDG pour l'action « Bloquer »
await login("PDG-DEMO");
await pageProjet();
const carteDisponible = page.getByTestId("bien-carte").filter({ hasText: "Disponible" }).first();
await carteDisponible.hover();
await page.waitForTimeout(500);
await page.screenshot({ path: `${dossier}/03-survol-carte.png`, fullPage: false });

// 4. Bouton en état loading : on ralentit la réponse de l'action serveur pour capturer le spinner
await carteDisponible.getByRole("button", { name: "Bloquer ce bien" }).click();
await page.getByRole("dialog").waitFor();
await page.getByLabel(/Commentaire/).fill("Réservé pour un partenaire — capture design");
let ralenti = false; // une seule requête POST (l'action serveur) est retardée
await page.route("**/dashboard/projets/**", async (route) => {
  if (route.request().method() === "POST" && !ralenti) {
    ralenti = true;
    await new Promise((r) => setTimeout(r, 2500));
  }
  await route.continue();
});
await page.getByTestId("confirmer-blocage").click();
await page.waitForSelector('[data-testid="confirmer-blocage"][data-loading="true"]');
await page.waitForTimeout(150);
await page.screenshot({ path: `${dossier}/04-bouton-loading.png`, fullPage: false });
await page.getByTestId("toast").waitFor({ timeout: 10_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${dossier}/05-toast-et-badge-anime.png`, fullPage: false });

// 6. Filtres : état vide travaillé
await page.getByTestId("filtre-recherche").fill("zzz-introuvable");
await page.waitForTimeout(700);
await page.screenshot({ path: `${dossier}/06-etat-vide.png`, fullPage: false });

// 7. Menu « plus d'actions » ouvert (vue liste, Directeur Commercial : bloquer + supprimer n'existent pas ; PDG : débloquer)
await page.getByTestId("filtre-recherche").fill("");
await page.getByTestId("vue-liste").click();
await page.getByTestId("biens-liste").waitFor();
await page.waitForTimeout(500);
const ligne = page.getByTestId("bien-ligne").filter({ hasText: "Bloqué par le PDG" }).first();
await ligne.getByRole("button", { name: "Plus d'actions" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${dossier}/07-menu-actions.png`, fullPage: false });

await navigateur.close();
console.log(`Captures enregistrées dans ${dossier}/`);
