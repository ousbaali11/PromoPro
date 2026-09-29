import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, loginAvec, SUFFIXE_RUN } from "./helpers";

/*
 * Mot de passe oublié par e-mail (comptes internes). Sans RESEND_API_KEY et
 * pendant la suite e2e, aucun e-mail ne part : le message est capturé et lu
 * sur /api/dev/courriels (route absente en production).
 *
 * Deux comptes créés par le Directeur Commercial : l'un avec e-mail (circuit
 * complet), l'autre sans (invitation à contacter son créateur). Les comptes
 * du jeu de données ne sont jamais modifiés.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const AVEC = { nom: `Oubli${SUFFIXE}`, email: `oubli.${SUFFIXE.toLowerCase()}@exemple.ma`, identifiant: "", mdp: "" };
const SANS = { nom: `SansMail${SUFFIXE}`, identifiant: "", mdp: "" };
const NOUVEAU_MDP = `Nouveau${SUFFIXE}2026`;

type Courriel = { a: string; sujet: string; texte: string; date: string };

async function courriels(page: Page): Promise<Courriel[]> {
  const r = await page.request.get("/api/dev/courriels");
  expect(r.status()).toBe(200);
  return ((await r.json()) as { courriels: Courriel[] }).courriels;
}

function lienDuCourriel(c: Courriel) {
  const m = c.texte.match(/https?:\/\/\S+\/reinitialiser-mot-de-passe\?token=[A-Za-z0-9_-]+/);
  expect(m, "lien de réinitialisation dans le corps").toBeTruthy();
  return new URL(m![0]).pathname + new URL(m![0]).search;
}

async function recruter(page: Page, nom: string, email: string) {
  await page.goto("/dashboard/equipe");
  const form = page.getByTestId("form-recrue");
  await form.locator("form[data-hydrated='true']").waitFor();
  await form.getByLabel("Nom", { exact: true }).fill(nom);
  await form.getByLabel("Prénom").fill("Test");
  if (email) await form.getByLabel("E-mail").fill(email);
  await form.getByRole("button", { name: "Créer le compte" }).click();
  const dd = form.getByTestId("bloc-acces").locator("dd");
  return { identifiant: (await dd.nth(0).innerText()).trim(), mdp: (await dd.nth(1).innerText()).trim() };
}

async function demander(page: Page, identifiant: string) {
  await page.context().clearCookies();
  await page.goto("/mot-de-passe-oublie");
  await page.getByLabel("Identifiant").fill(identifiant);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
}

async function contexteConnecte(browser: Browser, identifiant: string, mdp: string) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await loginAvec(p, identifiant, mdp, /\/dashboard$/);
  return { ctx, page: p };
}

test("mise en place : deux comptes commerciaux, avec et sans e-mail ; lien « Mot de passe oublié ? » sur /login", async ({ page }) => {
  await login(page, "DIRCOM");
  Object.assign(AVEC, await recruter(page, AVEC.nom, AVEC.email));
  Object.assign(SANS, await recruter(page, SANS.nom, ""));
  expect(AVEC.identifiant).toMatch(/^COM-/);
  expect(SANS.identifiant).toMatch(/^COM-/);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId("lien-mot-de-passe-oublie").click();
  await expect(page).toHaveURL(/\/mot-de-passe-oublie$/);
  await expect(page.getByLabel("Identifiant")).toBeVisible();
});

test("demande : même message pour un identifiant inconnu et un compte avec e-mail ; l'e-mail (capturé) contient un lien valable ; un compte sans e-mail est invité à contacter son créateur", async ({ page }) => {
  const avantInconnu = (await courriels(page)).length;
  await demander(page, `INCONNU-${SUFFIXE}`);
  await expect(page.getByTestId("demande-envoyee")).toHaveText("Si ce compte existe, un e-mail a été envoyé.");
  await expect(page.getByTestId("sans-email")).toHaveCount(0);
  expect((await courriels(page)).length, "aucun e-mail pour un identifiant inconnu").toBe(avantInconnu);

  await demander(page, AVEC.identifiant);
  await expect(page.getByTestId("demande-envoyee")).toHaveText("Si ce compte existe, un e-mail a été envoyé.");
  await expect(page.getByTestId("sans-email")).toHaveCount(0);
  const recus = (await courriels(page)).filter((c) => c.a === AVEC.email);
  expect(recus).toHaveLength(1);
  expect(recus[0].sujet).toContain("réinitialisation");
  expect(recus[0].texte).toContain("Bonjour Test");
  lienDuCourriel(recus[0]);

  const avantSans = (await courriels(page)).length;
  await demander(page, SANS.identifiant);
  await expect(page.getByTestId("demande-envoyee")).toHaveText("Si ce compte existe, un e-mail a été envoyé.");
  await expect(page.getByTestId("sans-email")).toContainText("Contactez la personne qui l'a créé");
  expect((await courriels(page)).length, "aucun e-mail pour un compte sans adresse").toBe(avantSans);
});

test("réinitialisation : règles du mot de passe, ancien refusé, nouveau accepté, session ouverte fermée, lien à usage unique, journal", async ({ page, browser }) => {
  // Session ouverte AVANT la réinitialisation, dans un autre navigateur
  const ancienne = await contexteConnecte(browser, AVEC.identifiant, AVEC.mdp);
  await ancienne.page.goto("/dashboard/projets");
  await expect(ancienne.page).toHaveURL(/\/dashboard\/projets$/);

  const lien = lienDuCourriel((await courriels(page)).filter((c) => c.a === AVEC.email)[0]);
  await page.context().clearCookies();
  await page.goto(lien);
  await expect(page.getByTestId("form-nouveau-mot-de-passe")).toBeVisible();
  await expect(page.getByText(AVEC.identifiant)).toBeVisible();

  // Trop court, puis sans chiffre, puis confirmation différente : refusés, rien ne change
  for (const [mdp, confirmation, attendu] of [
    ["abc1", "abc1", /au moins 8 caractères/],
    ["abcdefgh", "abcdefgh", /une lettre et un chiffre/],
    [NOUVEAU_MDP, `${NOUVEAU_MDP}x`, /ne sont pas identiques/],
  ] as const) {
    await page.getByLabel("Nouveau mot de passe").fill(mdp);
    await page.getByLabel("Confirmez le mot de passe").fill(confirmation);
    await page.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
    await expect(page.getByTestId("erreur-mot-de-passe")).toHaveText(attendu);
  }

  await page.getByLabel("Nouveau mot de passe").fill(NOUVEAU_MDP);
  await page.getByLabel("Confirmez le mot de passe").fill(NOUVEAU_MDP);
  await page.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
  await expect(page).toHaveURL(/\/login\?motif=mot-de-passe-modifie$/);
  await expect(page.getByTestId("mot-de-passe-modifie")).toBeVisible();

  // L'ancien mot de passe ne fonctionne plus, le nouveau oui
  await page.getByLabel("Identifiant").fill(AVEC.identifiant);
  await page.getByLabel("Mot de passe").fill(AVEC.mdp);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
  await loginAvec(page, AVEC.identifiant, NOUVEAU_MDP, /\/dashboard$/);

  // La session ouverte avant la réinitialisation est fermée
  await ancienne.page.goto("/dashboard/projets");
  await expect(ancienne.page).toHaveURL(/\/login\?motif=compte-inactif$/);
  await ancienne.ctx.close();

  // Le lien ne sert qu'une fois
  await page.context().clearCookies();
  await page.goto(lien);
  await expect(page.getByTestId("jeton-invalide")).toBeVisible();
  await expect(page.getByTestId("form-nouveau-mot-de-passe")).toHaveCount(0);
  // Un jeton forgé est refusé de la même façon
  await page.goto(`/reinitialiser-mot-de-passe?token=${"A".repeat(43)}`);
  await expect(page.getByTestId("jeton-invalide")).toBeVisible();

  // Journal du promoteur : demande puis réinitialisation, au nom du compte concerné
  await login(page, "PDG");
  await page.goto("/dashboard/journal?periode=jour");
  const lignes = page.getByTestId("journal-ligne").filter({ hasText: `Test ${AVEC.nom}` });
  await expect(lignes.filter({ hasText: "e-mail envoyé" })).toHaveCount(1);
  await expect(lignes.filter({ hasText: "Mot de passe réinitialisé par e-mail" })).toHaveCount(1);
  await expect(page.getByTestId("journal-ligne").filter({ hasText: `Test ${SANS.nom}` }).filter({ hasText: "aucun e-mail renseigné" })).toHaveCount(1);
});

test("limite de débit : la quatrième demande pour le même identifiant en quinze minutes est refusée sans e-mail supplémentaire", async ({ page }) => {
  // Une demande déjà faite plus haut pour ce compte : la 2e et la 3e passent, la 4e est bloquée
  const avant = (await courriels(page)).filter((c) => c.a === AVEC.email).length;
  for (let i = 0; i < 2; i++) {
    await demander(page, AVEC.identifiant);
    await expect(page.getByTestId("demande-envoyee")).toBeVisible();
  }
  await demander(page, AVEC.identifiant);
  await expect(page.getByText(/Trop de demandes en peu de temps/)).toBeVisible();
  expect((await courriels(page)).filter((c) => c.a === AVEC.email).length).toBe(avant + 2);
});
