import { expect, test, type Page } from "@playwright/test";
import { deposerFichier, lireUrl, login, planSynthetique, pngEchec } from "./helpers";

/*
 * Laboratoire de génération 3D (/admin/plan3d, Super Admin) : clés d'API
 * chiffrées et masquées, un seul fournisseur actif, bac à sable qui exerce
 * les adaptateurs réels contre le simulateur /api/dev/plan3d-stub (les
 * variables GEMINI_API_URL / NEURAL4D_API_URL y pointent pendant la suite).
 * Aucun bien ni client n'est touché. Le préfixe « a » garantit que ce spec passe avant
 * plan3d-b-biens.spec.ts : son premier test vérifie l'état initial (aucune clé, aucun fournisseur actif).
 */
test.describe.configure({ mode: "serial" });

const CLE_GEMINI = "AIzaSy_test_0123456789abcdef";
const CLE_NEURAL4D = "n4d_test_fedcba9876543210";

/** Adresse du modèle d'un <model-viewer> rendu côté client : React 19 pose `src` en propriété, l'attribut suit après montée en charge du composant. */
async function srcModele(ligne: ReturnType<Page["locator"]>) {
  const viewer = ligne.locator("model-viewer");
  await expect(viewer).toBeAttached();
  let src = "";
  await expect
    .poll(async () => {
      src = await viewer.evaluate((el) => el.getAttribute("src") || String((el as unknown as { src?: string }).src ?? ""));
      return src;
    })
    .toMatch(/\/api\/files\/plans-3d\//);
  return src;
}

function carte(page: Page, fournisseur: "GEMINI" | "NEURAL4D") {
  return page.getByTestId(`carte-fournisseur-${fournisseur}`);
}

async function enregistrerCle(page: Page, fournisseur: "GEMINI" | "NEURAL4D", cle: string) {
  const c = carte(page, fournisseur);
  await c.getByLabel(/Clé d'API|Nouvelle clé d'API/).fill(cle);
  await c.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(c.getByTestId("cle-enregistree")).toBeVisible();
}

async function lancerEssai(page: Page, fournisseur: "GEMINI" | "GEMINI_RENDU" | "NEURAL4D" | "PROMOPRO", fichier: { name: string; buffer?: Buffer }) {
  const form = page.getByTestId("form-essai");
  await page.locator('[data-testid="form-essai"][data-hydrated="true"]').waitFor();
  await deposerFichier(form, "planUrl", [fichier]);
  await form.getByLabel("Fournisseur à tester").selectOption(fournisseur);
  await form.getByRole("button", { name: "Générer" }).click();
  await expect(page.getByTestId("essai-ligne").first()).toHaveAttribute("data-fournisseur", fournisseur);
  return page.getByTestId("essai-ligne").first();
}

test("accès : le Super Admin voit le lien et la page ; un rôle interne est redirigé ; quatre fournisseurs, aucune clé au départ, aucune génération automatique", async ({ page }) => {
  await login(page, "PDG");
  await page.goto("/admin/plan3d");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId("lien-plan3d")).toHaveCount(0);

  await login(page, "SUPERADMIN");
  await page.getByTestId("lien-plan3d").click();
  await expect(page).toHaveURL(/\/admin\/plan3d$/);
  await expect(page.getByTestId("chiffrement-indisponible")).toHaveCount(0);
  await expect(page.getByTestId("etat-generation")).toContainText("Aucun fournisseur actif");
  // Exactement quatre fournisseurs : Gemini, Gemini — rendu 3D, Neural4D, Solution PromoPro (MeltFlex et la variante B ont été retirés)
  await expect(page.locator('[data-testid^="carte-fournisseur-"]')).toHaveCount(4);
  await expect(page.getByTestId("carte-fournisseur-MELTFLEX")).toHaveCount(0);
  await expect(page.getByTestId("carte-fournisseur-PROMOPRO_B")).toHaveCount(0);
  await expect(page.getByTestId("form-essai").locator("option")).toHaveCount(4);
  // « Gemini — rendu 3D » partage la clé de Gemini : aucun formulaire de clé, option grisée tant que Gemini n'a pas de clé
  const rendu = page.getByTestId("carte-fournisseur-GEMINI_RENDU");
  await expect(rendu).toContainText("Gemini — rendu 3D");
  await expect(rendu.getByTestId("form-cle")).toHaveCount(0);
  await expect(rendu.getByTestId("cle-partagee")).toBeVisible();
  await expect(rendu.getByTestId("cle-masquee")).toContainText("saisissez la clé sur la carte Gemini");
  await expect(rendu.getByTestId("bouton-actif")).toBeDisabled();
  await expect(page.getByTestId("form-essai").locator('option[value="GEMINI_RENDU"]')).toBeDisabled();
  for (const f of ["GEMINI", "NEURAL4D"] as const) {
    await expect(carte(page, f).getByTestId("cle-masquee")).toHaveText("Aucune");
    await expect(carte(page, f).getByTestId("bouton-actif")).toBeDisabled();
  }
  await expect(carte(page, "GEMINI")).toContainText("Gemini");
  await expect(page.getByTestId("essais-vides")).toBeVisible();

  // « Solution PromoPro » : fournisseur interne sans clé, testable dans le bac à sable, jamais activable pour les biens
  const interne = page.getByTestId("carte-fournisseur-PROMOPRO");
  await expect(interne).toContainText("Solution PromoPro");
  await expect(interne.getByTestId("badge-en-developpement")).toContainText("pas encore activable");
  await expect(interne.getByTestId("form-cle")).toHaveCount(0);
  await expect(interne.getByTestId("bouton-actif")).toBeDisabled();
  await expect(page.getByTestId("form-essai").locator('option[value="PROMOPRO"]')).toHaveCount(1);
});

test("clés d'API : enregistrées chiffrées, réaffichées masquées (quatre derniers caractères), jamais en clair dans la page ; journal", async ({ page }) => {
  await login(page, "SUPERADMIN");
  await page.goto("/admin/plan3d");
  await enregistrerCle(page, "GEMINI", CLE_GEMINI);
  await enregistrerCle(page, "NEURAL4D", CLE_NEURAL4D);
  await page.reload();
  await expect(carte(page, "GEMINI").getByTestId("cle-masquee")).toHaveText(/^•+cdef$/);
  await expect(carte(page, "NEURAL4D").getByTestId("cle-masquee")).toHaveText(/^•+3210$/);
  // La clé de Gemini rend « Gemini — rendu 3D » utilisable, sans la réafficher
  await expect(page.getByTestId("carte-fournisseur-GEMINI_RENDU").getByTestId("cle-masquee")).toHaveText("Clé de Gemini (partagée)");
  await expect(page.getByTestId("form-essai").locator('option[value="GEMINI_RENDU"]')).toBeEnabled();
  const html = await page.content();
  expect(html).not.toContain(CLE_GEMINI);
  expect(html).not.toContain(CLE_NEURAL4D);
  // Remplacement : la nouvelle fin apparaît, l'ancienne disparaît
  await enregistrerCle(page, "GEMINI", "AIzaSy_test_remplacee_9999");
  await page.reload();
  await expect(carte(page, "GEMINI").getByTestId("cle-masquee")).toHaveText(/^•+9999$/);
  await enregistrerCle(page, "GEMINI", CLE_GEMINI);

  await page.goto("/admin/journal?periode=jour");
  const lignes = page.getByTestId("journal-ligne").filter({ hasText: "Gemini" }).filter({ hasText: "Clé d'API" });
  await expect(lignes.first()).toBeVisible();
  await expect(lignes.filter({ hasText: "9999" })).toHaveCount(1);
  await expect(page.getByTestId("journal-ligne").filter({ hasText: CLE_GEMINI })).toHaveCount(0);
});

test("fournisseur actif : un seul à la fois, bascule journalisée, désactivation possible", async ({ page }) => {
  await login(page, "SUPERADMIN");
  await page.goto("/admin/plan3d");
  await carte(page, "GEMINI").getByTestId("bouton-actif").click();
  await expect(carte(page, "GEMINI").getByTestId("badge-actif")).toBeVisible();
  await expect(page.getByTestId("etat-generation")).toContainText("Gemini");
  await carte(page, "NEURAL4D").getByTestId("bouton-actif").click();
  await expect(carte(page, "NEURAL4D").getByTestId("badge-actif")).toBeVisible();
  await expect(carte(page, "GEMINI").getByTestId("badge-actif")).toHaveCount(0);
  await carte(page, "NEURAL4D").getByTestId("bouton-actif").click(); // Désactiver
  await expect(page.getByTestId("badge-actif")).toHaveCount(0);
  await expect(page.getByTestId("etat-generation")).toContainText("Aucun fournisseur actif");
  await page.goto("/admin/journal?periode=jour");
  await expect(page.getByTestId("journal-ligne").filter({ hasText: "Fournisseur actif pour les générations sur les biens : Neural4D" })).toHaveCount(1);
  await expect(page.getByTestId("journal-ligne").filter({ hasText: "Génération automatique désactivée" })).toHaveCount(1);
});

test("bac à sable : le même plan chez Gemini puis Neural4D → deux modèles prêts, servis comme fichiers plans-3d, aperçu <model-viewer> ; durée affichée", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "SUPERADMIN");
  await page.goto("/admin/plan3d");
  for (const f of ["GEMINI", "NEURAL4D"] as const) {
    const ligne = await lancerEssai(page, f, { name: "plan-labo.png" });
    await expect(ligne.getByTestId("essai-statut")).toHaveText("Prêt", { timeout: 60_000 });
    await expect(ligne.getByTestId("essai-duree")).toBeVisible();
    await ligne.getByTestId("voir-modele").click();
    const src = await srcModele(ligne);
    expect(src).toMatch(/^\/api\/files\/plans-3d\/[0-9a-f-]+\.glb$/);
    const reponse = await lireUrl(page, src);
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["content-type"]).toBe("model/gltf-binary");
    expect((await reponse.body()).subarray(0, 4).toString("ascii")).toBe("glTF");
    await page.getByRole("button", { name: "Nouvel essai" }).click();
  }
  await expect(page.getByTestId("essai-ligne")).toHaveCount(2);
  await expect(page.getByTestId("liste-essais")).not.toHaveAttribute("data-en-cours", "true");

  // Les fichiers du laboratoire ne sont servis à aucun compte de promoteur
  const src = await srcModele(page.getByTestId("essai-ligne").first());
  await login(page, "PDG");
  expect((await lireUrl(page, src)).status()).toBe(403);
});

test("échecs : image refusée par le fournisseur (Gemini sans pièce, Neural4D échec au suivi) et clé invalide → statut Échec avec message, sans effet ailleurs", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "SUPERADMIN");
  await page.goto("/admin/plan3d");
  const echec = pngEchec();
  const l1 = await lancerEssai(page, "GEMINI", { name: "plan-echec.png", buffer: echec });
  await expect(l1.getByTestId("essai-statut")).toHaveText("Échec", { timeout: 60_000 });
  await expect(l1.getByTestId("essai-erreur")).toContainText("aucune pièce");
  await page.getByRole("button", { name: "Nouvel essai" }).click();
  const l2 = await lancerEssai(page, "NEURAL4D", { name: "plan-echec.png", buffer: echec });
  await expect(l2.getByTestId("essai-statut")).toHaveText("Échec", { timeout: 60_000 });
  await expect(l2.getByTestId("essai-erreur")).toContainText("Neural4D");
  // Clé invalide, chez Gemini (400 « API key not valid ») comme chez Neural4D (401)
  for (const f of ["GEMINI", "NEURAL4D"] as const) {
    await enregistrerCle(page, f, "cle-invalide");
    await page.getByRole("button", { name: "Nouvel essai" }).click();
    const l3 = await lancerEssai(page, f, { name: "plan-labo.png" });
    await expect(l3.getByTestId("essai-statut")).toHaveText("Échec", { timeout: 60_000 });
    await expect(l3.getByTestId("essai-erreur")).toContainText("refuse la clé d'API");
    await enregistrerCle(page, f, f === "GEMINI" ? CLE_GEMINI : CLE_NEURAL4D);
  }
  // Un PDF n'est pas accepté par le bac à sable
  await page.getByRole("button", { name: "Nouvel essai" }).click();
  const form = page.getByTestId("form-essai");
  await page.locator('[data-testid="form-essai"][data-hydrated="true"]').waitFor();
  await form.locator('input[type="file"]').first().setInputFiles({ name: "plan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await expect(form.locator('input[type="hidden"][name="planUrl"]')).toHaveValue("");
});

test("Gemini — rendu 3D : quatre vues assemblées en une planche servie comme image, visionneuse tournante (glisser, boutons, zoom), activable pour les biens", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "SUPERADMIN");
  await page.goto("/admin/plan3d");
  const ligne = await lancerEssai(page, "GEMINI_RENDU", { name: "plan-rendu.png" });
  await expect(ligne.getByTestId("essai-statut")).toHaveText("Prêt", { timeout: 90_000 });
  await ligne.getByTestId("voir-modele").click();
  const visionneuse = ligne.getByTestId("rendu-tournant");
  await expect(visionneuse).toBeVisible();
  await expect(visionneuse).toHaveAttribute("data-nb-vues", "4");
  const src = await visionneuse.locator("img").getAttribute("src");
  expect(src).toMatch(/^\/api\/files\/rendus-3d\/[0-9a-f-]+\.jpg$/);
  const reponse = await lireUrl(page, src!);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toBe("image/jpeg");
  // Navigation : bouton suivant, puis glisser vers la gauche (sens antihoraire)
  await visionneuse.getByTestId("rendu-suivant").click();
  await expect(visionneuse).toHaveAttribute("data-vue", "1");
  await expect(visionneuse.getByTestId("rendu-angle")).toHaveText("90°");
  const zone = visionneuse.getByRole("img");
  const boite = (await zone.boundingBox())!;
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width / 2 - 170, boite.y + boite.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(visionneuse).toHaveAttribute("data-vue", "3");
  // Activable pour les biens, avec la clé de Gemini
  const carteRendu = page.getByTestId("carte-fournisseur-GEMINI_RENDU");
  await expect(carteRendu.getByTestId("bouton-actif")).toBeEnabled();
  await carteRendu.getByTestId("bouton-actif").click();
  await expect(carteRendu.getByTestId("badge-actif")).toBeVisible();
  await expect(page.getByTestId("etat-generation")).toContainText("Gemini — rendu 3D");
  await carteRendu.getByTestId("bouton-actif").click(); // Désactiver, pour laisser l'état initial à plan3d-b-biens
  await expect(page.getByTestId("badge-actif")).toHaveCount(0);
});

test("Solution PromoPro : génération locale dans le bac à sable (modèle installé → .glb servi ; sinon échec explicite), jamais activable pour les biens", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "SUPERADMIN");
  await page.goto("/admin/plan3d");
  const carte = page.getByTestId("carte-fournisseur-PROMOPRO");
  const installe = (await carte.getByTestId("cle-masquee").innerText()).includes("installé sur le serveur");
  const option = page.getByTestId("form-essai").locator('option[value="PROMOPRO"]');
  if (!installe) {
    test.info().annotations.push({ type: "note", description: "modèle ONNX absent : seule l'indisponibilité est vérifiée" });
    await expect(option).toBeDisabled();
    await expect(carte.getByTestId("cle-masquee")).toContainText("non installé");
    await expect(carte.getByTestId("bouton-actif")).toBeDisabled();
    return;
  }
  await expect(option).toBeEnabled();
  const ligne = await lancerEssai(page, "PROMOPRO", { name: "plan-interne.png", buffer: planSynthetique() });
  await expect(ligne.getByTestId("essai-statut")).toHaveText("Prêt", { timeout: 60_000 });
  await ligne.getByTestId("voir-modele").click();
  const src = await srcModele(ligne);
  const reponse = await lireUrl(page, src);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toBe("model/gltf-binary");
  expect((await reponse.body()).subarray(0, 4).toString("ascii")).toBe("glTF");
  // Toujours pas activable pour les biens, même modèle installé
  await expect(carte.getByTestId("bouton-actif")).toBeDisabled();
});
