import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, loginAvec, confirmer } from "./helpers";

/*
 * Révocation immédiate des sessions (audit, phase 4) : un compte suspendu ou
 * supprimé PENDANT qu'il a une session ouverte perd l'accès à la page
 * protégée suivante (pas seulement à la prochaine connexion) ; la suspension
 * d'un promoteur par le Super Admin coupe immédiatement TOUS ses comptes,
 * staff et clients, et refuse leur connexion.
 */
const SUFFIXE = Date.now().toString(36).toUpperCase();

async function contexteConnecte(browser: Browser, identifiant: string, mdp: string, atterrissage: RegExp) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await loginAvec(page, identifiant, mdp, atterrissage);
  return { ctx, page };
}

async function lireAcces(page: Page) {
  const dd = page.getByTestId("bloc-acces").first().locator("dd");
  return { identifiant: (await dd.nth(0).innerText()).trim(), mdp: (await dd.nth(1).innerText()).trim() };
}

test("compte interne suspendu pendant sa session : la page suivante renvoie à la connexion ; réactivé, il se reconnecte", async ({ page, browser }) => {
  // Une recrue avec session ouverte dans un autre navigateur
  await login(page, "DIRCOM");
  await page.goto("/dashboard/equipe");
  await page.getByLabel("Nom", { exact: true }).fill(`Session${SUFFIXE}`);
  await page.getByLabel("Prénom").fill("Recrue");
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByText(/Compte .* créé/)).toBeVisible();
  const recrue = await lireAcces(page);
  const autre = await contexteConnecte(browser, recrue.identifiant, recrue.mdp, /\/dashboard$/);
  await autre.page.goto("/dashboard/projets");
  await expect(autre.page).toHaveURL(/\/dashboard\/projets$/);

  // Suspension par le directeur → la requête suivante de la recrue est refusée
  await page.goto("/dashboard/equipe");
  const ligne = page.getByTestId("membre-ligne").filter({ hasText: `Recrue Session${SUFFIXE}` });
  await confirmer(page, "bouton-suspendre", ligne);
  await expect(ligne.getByTestId("etat-compte")).toHaveText("(suspendu)");
  await autre.page.goto("/dashboard/projets");
  await expect(autre.page).toHaveURL(/\/login\?motif=compte-inactif$/);
  await expect(autre.page.getByTestId("session-fermee")).toContainText("Votre session a été fermée");
  expect((await autre.page.request.get("/api/recherche?q=a01")).status()).toBe(401);

  // Réactivation → connexion à nouveau possible
  await ligne.getByRole("button", { name: "Réactiver" }).click();
  await expect(ligne.getByTestId("etat-compte")).toHaveCount(0);
  await loginAvec(autre.page, recrue.identifiant, recrue.mdp, /\/dashboard$/);
  await autre.ctx.close();
});

test("client suspendu pendant sa session : l'espace client est fermé à la page suivante", async ({ page, browser }) => {
  const client = await contexteConnecte(browser, "CL-DEMO", "demo1234", /\/client(\/biens\/[^/]+)?$/);
  await client.page.goto("/client");
  await expect(client.page).toHaveURL(/\/client/);

  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: /Naciri/ }).first().click();
  await confirmer(page, "bouton-suspendre");
  await expect(page.getByTestId("etat-compte")).toHaveText("(suspendu)");

  await client.page.goto("/client");
  await expect(client.page).toHaveURL(/\/login\?motif=compte-inactif$/);

  await page.getByRole("button", { name: "Réactiver" }).click();
  await expect(page.getByTestId("etat-compte")).toHaveCount(0);
  await client.ctx.close();
});

test("promoteur suspendu par le Super Admin : ses comptes internes et clients perdent l'accès immédiatement et ne peuvent plus se connecter", async ({ page, browser }) => {
  // Promoteur C avec un PDG et un client
  await login(page, "SUPERADMIN");
  await page.goto("/admin/nouveau");
  await page.getByLabel("Nom du promoteur").fill(`Promoteur C ${SUFFIXE}`);
  for (const champ of ["pdg", "dircom", "dirfin"]) {
    await page.locator(`#${champ}Nom`).fill(`${champ} C`);
    await page.locator(`#${champ}Prenom`).fill("Session");
  }
  await page.getByRole("button", { name: /Créer le promoteur/ }).click();
  const blocs = page.getByTestId("bloc-acces");
  await expect(blocs).toHaveCount(3);
  const pdg = { identifiant: (await blocs.filter({ hasText: "PDG" }).locator("dd").nth(0).innerText()).trim(), mdp: (await blocs.filter({ hasText: "PDG" }).locator("dd").nth(1).innerText()).trim() };
  const dircom = {
    identifiant: (await blocs.filter({ hasText: "Directeur Commercial" }).locator("dd").nth(0).innerText()).trim(),
    mdp: (await blocs.filter({ hasText: "Directeur Commercial" }).locator("dd").nth(1).innerText()).trim(),
  };
  await page.goto("/admin");
  const lignePromoteur = page.getByTestId("promoteur-ligne").filter({ hasText: `Promoteur C ${SUFFIXE}` });
  await lignePromoteur.getByRole("button", { name: "Activer" }).click();
  await expect(lignePromoteur.locator('[data-statut="ACTIF"]')).toBeVisible();

  const dc = await contexteConnecte(browser, dircom.identifiant, dircom.mdp, /\/dashboard$/);
  await dc.page.goto("/dashboard/clients/nouveau");
  await dc.page.getByLabel("Nom", { exact: true }).fill(`ClientC${SUFFIXE}`);
  await dc.page.getByLabel("Prénom").fill("Session");
  await dc.page.getByLabel("Téléphone 1").fill("06 55 00 00 01");
  await dc.page.getByLabel("E-mail").fill(`clientc.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await dc.page.getByRole("button", { name: "Créer le client" }).click();
  const client = await lireAcces(dc.page);
  const sessionPdg = await contexteConnecte(browser, pdg.identifiant, pdg.mdp, /\/dashboard$/);
  const sessionClient = await contexteConnecte(browser, client.identifiant, client.mdp, /\/client(\/biens\/[^/]+)?$/);

  // Suspension du promoteur
  await confirmer(page, "bouton-suspendre-promoteur", lignePromoteur);
  await expect(lignePromoteur.locator('[data-statut="SUSPENDU"]')).toBeVisible();

  for (const [p, url] of [
    [sessionPdg.page, "/dashboard/propositions"],
    [dc.page, "/dashboard/projets"],
    [sessionClient.page, "/client"],
  ] as const) {
    await p.goto(url);
    await expect(p, url).toHaveURL(/\/login\?motif=compte-inactif$/);
  }
  // Nouvelles connexions refusées avec un message explicite
  for (const [identifiant, mdp, attendu] of [
    [pdg.identifiant, pdg.mdp, /abonnement de votre promoteur n'est pas actif/],
    [client.identifiant, client.mdp, /espace client de votre promoteur est momentanément indisponible/],
  ] as const) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Identifiant").fill(identifiant);
    await page.getByLabel("Mot de passe").fill(mdp);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText(attendu)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  }

  // Réactivation : l'accès revient
  await login(page, "SUPERADMIN");
  await page.goto("/admin");
  await page.getByTestId("promoteur-ligne").filter({ hasText: `Promoteur C ${SUFFIXE}` }).getByRole("button", { name: "Activer" }).click();
  await expect(page.getByTestId("promoteur-ligne").filter({ hasText: `Promoteur C ${SUFFIXE}` }).locator('[data-statut="ACTIF"]')).toBeVisible();
  await loginAvec(sessionPdg.page, pdg.identifiant, pdg.mdp, /\/dashboard$/);
  await loginAvec(sessionClient.page, client.identifiant, client.mdp, /\/client(\/biens\/[^/]+)?$/);
  for (const c of [dc.ctx, sessionPdg.ctx, sessionClient.ctx]) await c.close();
});

test("compte supprimé : plus de notifications de rôle, et sa session est fermée à la page suivante", async ({ page, browser }) => {
  await login(page, "DIRCOM");
  await page.goto("/dashboard/equipe");
  await page.getByLabel("Nom", { exact: true }).fill(`Supprime${SUFFIXE}`);
  await page.getByLabel("Prénom").fill("Recrue");
  await page.locator('select[name="role"]').selectOption({ label: "Service Après-Vente" });
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByText(/Compte .* créé/)).toBeVisible();
  const recrue = await lireAcces(page);
  const autre = await contexteConnecte(browser, recrue.identifiant, recrue.mdp, /\/dashboard$/);

  await page.goto("/dashboard/equipe");
  const ligne = page.getByTestId("membre-ligne").filter({ hasText: `Recrue Supprime${SUFFIXE}` });
  await confirmer(page, "bouton-supprimer", ligne);
  await expect(page.getByTestId("membre-ligne").filter({ hasText: `Recrue Supprime${SUFFIXE}` })).toHaveCount(0);
  await autre.page.goto("/dashboard/sav");
  await expect(autre.page).toHaveURL(/\/login\?motif=compte-inactif$/);
  await autre.ctx.close();

  // Un événement qui notifie le rôle SAV (demande de visite du client) ne crée rien pour le compte supprimé
  await login(page, "CLIENT");
  await page.goto("/client");
  await page.waitForURL(/\/client\/biens\/[^/]+$/);
  const bouton = page.getByRole("button", { name: "Demander une visite" });
  if ((await bouton.count()) === 1) await bouton.click();
  await login(page, "DIRCOM");
  await page.goto("/dashboard/equipe?supprimes=1");
  const supprimee = page.getByTestId("membre-ligne").filter({ hasText: `Recrue Supprime${SUFFIXE}` });
  await supprimee.getByRole("button", { name: "Réactiver" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Compte réactivé" })).toBeVisible();
  const reactive = await contexteConnecte(browser, recrue.identifiant, recrue.mdp, /\/dashboard$/);
  await reactive.page.getByRole("button", { name: "Notifications" }).click();
  await expect(reactive.page.getByText("Demande de visite")).toHaveCount(0);
  await reactive.ctx.close();
});
