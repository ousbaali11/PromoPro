import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { confirmer, login, loginAvec, ouvrirFichePromoteur, SUFFIXE_RUN } from "./helpers";

/*
 * Espace Super Admin en fiches par promoteur : grille sur /admin, fiche
 * /admin/promoteurs/[id] (abonnement, logo, directions de ce promoteur
 * seulement, ajout d'une direction). Plusieurs titulaires d'un même rôle, ou
 * aucun, sont possibles ; la confirmation prévient quand une action laisserait
 * le promoteur sans titulaire d'un rôle. Les titulaires restants fonctionnent
 * indépendamment : connexion et notifications.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = SUFFIXE_RUN;
const P = { nom: `Promoteur Fiches ${SUFFIXE}`, href: "", pdg1: acces(), pdg2: acces(), dc1: acces(), dc2: acces(), com: acces() };
function acces() {
  return { identifiant: "", mdp: "" };
}

async function lireAcces(bloc: Locator) {
  const dd = bloc.locator("dd");
  return { identifiant: (await dd.nth(0).innerText()).trim(), mdp: (await dd.nth(1).innerText()).trim() };
}

async function ajouterDirection(page: Page, role: string, nom: string) {
  const form = page.getByTestId("form-ajout-direction");
  const bouton = form.getByTestId("ajouter-une-autre-direction");
  if (await bouton.count()) await bouton.click();
  await form.locator("form[data-hydrated='true']").waitFor();
  await form.getByLabel("Rôle").selectOption(role);
  await form.getByLabel("Nom", { exact: true }).fill(nom);
  await form.getByLabel("Prénom").fill("Fiche");
  await form.getByRole("button", { name: "Créer le compte" }).click();
  await expect(form.getByTestId("bloc-acces")).toBeVisible();
  return lireAcces(form.getByTestId("bloc-acces"));
}

function ligne(page: Page, nom: string) {
  return page.getByTestId("direction-ligne").filter({ hasText: nom });
}

async function contexte(browser: Browser, a: { identifiant: string; mdp: string }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAvec(page, a.identifiant, a.mdp, /\/dashboard$/);
  return { ctx, page };
}

test("grille de fiches sur /admin : plus de tableau plat, chaque fiche porte nom, statut, échéance et ouvre sa page de détail", async ({ page }) => {
  await login(page, "SUPERADMIN");
  await page.goto("/admin/nouveau");
  await page.getByLabel("Nom du promoteur").fill(P.nom);
  for (const champ of ["pdg", "dircom", "dirfin"]) {
    await page.locator(`#${champ}Nom`).fill(`${champ.toUpperCase()}-Un`);
    await page.locator(`#${champ}Prenom`).fill("Fiche");
  }
  await page.getByRole("button", { name: /Créer le promoteur/ }).click();
  const blocs = page.getByTestId("bloc-acces");
  await expect(blocs).toHaveCount(3);
  P.pdg1 = await lireAcces(blocs.filter({ hasText: "PDG" }));
  P.dc1 = await lireAcces(blocs.filter({ hasText: "Directeur Commercial" }));

  await page.goto("/admin");
  await expect(page.getByTestId("grille-promoteurs")).toBeVisible();
  await expect(page.getByTestId("table-promoteurs")).toHaveCount(0);
  await expect(page.getByTestId("table-directions")).toHaveCount(0);
  const carte = page.getByTestId("promoteur-ligne").filter({ hasText: P.nom });
  await expect(carte.locator('[data-statut="EN_ATTENTE"]')).toBeVisible();
  await expect(carte.getByTestId("promoteur-echeance")).toHaveText("—");
  await expect(carte.getByTestId("promoteur-directions")).toContainText("3 en exercice");

  P.href = await ouvrirFichePromoteur(page, P.nom);
  await expect(page.getByRole("heading", { name: P.nom })).toBeVisible();
  // Directions de CE promoteur uniquement : trois lignes, aucune du promoteur de démonstration
  await expect(page.getByTestId("direction-ligne")).toHaveCount(3);
  await expect(page.getByTestId("direction-ligne").filter({ hasText: "PDG-DEMO" })).toHaveCount(0);
  // Abonnement depuis la fiche : activation, échéance visible sur la carte de la grille
  await page.getByRole("button", { name: "Activer" }).click();
  await expect(page.getByTestId("carte-abonnement").locator('[data-statut="ACTIF"]')).toBeVisible();
  await page.goto("/admin");
  await expect(carte.locator('[data-statut="ACTIF"]')).toBeVisible();
  await expect(carte.getByTestId("promoteur-echeance")).not.toHaveText("—");
});

test("ajout de directions : un second Directeur Commercial et un second PDG, sans contrainte d'unicité ; identifiants affichés une fois", async ({ page }) => {
  await login(page, "SUPERADMIN");
  await page.goto(P.href);
  P.dc2 = await ajouterDirection(page, "DIRECTEUR_COMMERCIAL", "DC-Deux");
  expect(P.dc2.identifiant).toMatch(/^DC-/);
  P.pdg2 = await ajouterDirection(page, "PDG", "PDG-Deux");
  expect(P.pdg2.identifiant).toMatch(/^PDG-/);
  await expect(page.getByTestId("direction-ligne")).toHaveCount(5);
  await expect(ligne(page, "DC-Deux")).toContainText("Directeur Commercial");
  await expect(ligne(page, "PDG-Deux")).toContainText("PDG");
  // Rôle hors direction refusé côté serveur (formulaire forgé)
  await page.getByTestId("ajouter-une-autre-direction").click();
  await page.getByTestId("form-ajout-direction").locator("form[data-hydrated='true']").waitFor();
  await page.getByTestId("form-ajout-direction").locator("select[name='role']").evaluate((el) => {
    const o = document.createElement("option");
    o.value = "COMMERCIAL";
    o.textContent = "Commercial";
    (el as HTMLSelectElement).appendChild(o);
    (el as HTMLSelectElement).value = "COMMERCIAL";
  });
  await page.getByTestId("form-ajout-direction").getByLabel("Nom", { exact: true }).fill("Forge");
  await page.getByTestId("form-ajout-direction").getByLabel("Prénom").fill("Forge");
  await page.getByTestId("form-ajout-direction").getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByText("Le rôle doit être PDG, Directeur Commercial ou Directeur Financier.")).toBeVisible();
  await expect(page.getByTestId("direction-ligne")).toHaveCount(5);
  // Journal plateforme
  await page.goto("/admin/journal?periode=jour");
  await expect(page.getByTestId("journal-ligne").filter({ hasText: "Fiche DC-Deux" }).filter({ hasText: `Direction ajoutée à ${P.nom} : Directeur Commercial` })).toHaveCount(1);
});

test("avertissement du dernier titulaire : absent quand un autre titulaire reste, présent sinon ; suppression du premier Directeur Commercial", async ({ page }) => {
  await login(page, "SUPERADMIN");
  await page.goto(P.href);
  // DC-Un a un homologue (DC-Deux) : pas d'avertissement ; DIRFIN-Un est seul : avertissement explicite
  await expect(ligne(page, "DIRCOM-Un").getByTestId("avertissement-dernier-titulaire")).toHaveCount(0);
  await expect(ligne(page, "DIRFIN-Un").getByTestId("avertissement-dernier-titulaire")).toHaveText(
    "Ce promoteur n'aura plus aucun Directeur Financier après cette action.",
  );
  await expect(page.getByTestId("roles-sans-titulaire")).toHaveCount(0);

  // Suppression douce du premier Directeur Commercial (confirmation en deux temps, toast Annuler, journal — inchangés)
  await confirmer(page, "bouton-supprimer", ligne(page, "DIRCOM-Un"));
  await expect(ligne(page, "DIRCOM-Un").getByTestId("etat-compte")).toHaveAttribute("data-etat", "supprime");
  await expect(page.getByTestId("toast-action")).toBeVisible();

  // Suspension du dernier Directeur Financier : autorisée, la confirmation porte la mention
  const suspendre = ligne(page, "DIRFIN-Un").getByTestId("bouton-suspendre");
  await suspendre.click();
  await expect(suspendre).toHaveAttribute("data-armed", "true");
  await expect(suspendre).toContainText("Ce promoteur n'aura plus aucun Directeur Financier après cette action.");
  await suspendre.click();
  await expect(ligne(page, "DIRFIN-Un").getByTestId("etat-compte")).toHaveAttribute("data-etat", "suspendu");
  await expect(page.getByTestId("roles-sans-titulaire")).toContainText("Directeur Financier");
  await page.goto("/admin");
  await expect(page.getByTestId("promoteur-ligne").filter({ hasText: P.nom }).getByTestId("promoteur-directions")).toContainText("1 rôle sans titulaire");
  // Réactivation (comme avant)
  await page.goto(P.href);
  await ligne(page, "DIRFIN-Un").getByRole("button", { name: "Réactiver" }).click();
  await expect(ligne(page, "DIRFIN-Un").getByTestId("etat-compte")).toHaveCount(0);
});

test("les titulaires restants fonctionnent indépendamment : le premier DC ne se connecte plus, le second travaille, les deux PDG reçoivent la même notification", async ({ page, browser }) => {
  // DC-Un supprimé : connexion refusée
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(P.dc1.identifiant);
  await page.getByLabel("Mot de passe").fill(P.dc1.mdp);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Ce compte a été désactivé. Contactez votre direction.")).toBeVisible();

  // DC-Deux : projet, bien, commercial (son pôle)
  await loginAvec(page, P.dc2.identifiant, P.dc2.mdp, /\/dashboard$/);
  await page.goto("/dashboard/projets/nouveau");
  await page.getByLabel("Nom du projet").fill(`Projet Fiches ${SUFFIXE}`);
  await page.getByLabel(/Nom du compte/).fill("SCI Fiches");
  await page.getByLabel(/IBAN/).fill("MA00 1111 2222 3333 4444 5555");
  await page.getByRole("button", { name: /Créer le projet/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/(?!nouveau)[^/]+$/);
  const form = page.getByTestId("form-ajout-bien");
  await form.getByLabel("Désignation").fill(`Villa Fiches ${SUFFIXE}`);
  await form.getByLabel(/Prix/).fill("900000");
  await form.getByLabel(/Surface/).fill("120");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  await expect(page.getByRole("link", { name: `Villa Fiches ${SUFFIXE}`, exact: true })).toBeVisible();
  await page.goto("/dashboard/equipe");
  const recrue = page.getByTestId("form-recrue");
  await recrue.locator("form[data-hydrated='true']").waitFor();
  await recrue.getByLabel("Nom", { exact: true }).fill(`ComFiches${SUFFIXE}`);
  await recrue.getByLabel("Prénom").fill("Fiche");
  await recrue.getByRole("button", { name: "Créer le compte" }).click();
  P.com = await lireAcces(recrue.getByTestId("bloc-acces"));

  // Les deux PDG sont connectés avant la proposition
  const pdg1 = await contexte(browser, P.pdg1);
  const pdg2 = await contexte(browser, P.pdg2);

  // Commercial : client puis proposition → notification « Nouvelle proposition de vente » à TOUS les PDG
  await loginAvec(page, P.com.identifiant, P.com.mdp, /\/dashboard$/);
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(`ClientFiches${SUFFIXE}`);
  await page.getByLabel("Prénom").fill("Fiche");
  await page.getByLabel("Téléphone 1").fill("06 44 00 00 09");
  await page.getByLabel("E-mail").fill(`clientfiches.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByTestId("bloc-acces")).toBeVisible();
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: new RegExp(`Projet Fiches ${SUFFIXE}`) }).first().click();
  await page.getByRole("link", { name: `Villa Fiches ${SUFFIXE}`, exact: true }).click();
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
  const select = page.locator("#clientId");
  const valeur = await select.evaluate((el, nom) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.includes(nom))?.value ?? "", `ClientFiches${SUFFIXE}`);
  expect(valeur).not.toBe("");
  await select.selectOption(valeur);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);

  for (const [nom, p] of [
    ["PDG-Un", pdg1.page],
    ["PDG-Deux", pdg2.page],
  ] as const) {
    await p.goto("/dashboard/propositions");
    await expect(p.locator("[data-card]", { hasText: `Villa Fiches ${SUFFIXE}` }), `${nom} voit la proposition`).toBeVisible();
    await p.getByTestId("cloche-notifications").click();
    await expect(p.getByText("Nouvelle proposition de vente").first(), `${nom} est notifié`).toBeVisible();
  }
  await pdg1.ctx.close();
  await pdg2.ctx.close();
});
