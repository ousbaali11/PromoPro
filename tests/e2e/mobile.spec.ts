import { expect, test, type Locator, type Page } from "@playwright/test";
import { classeurXlsx, deposerFichier, hrefBienStaff, login, loginAvec, prochainJour, ymd } from "./helpers";

/*
 * Audit mobile avec interaction réelle : chaque page est visitée aux trois
 * largeurs (320, 375, 768 px) et l'on y agit — menus, panneaux, formulaires
 * remplis et soumis, listes dynamiques, éditeurs — en vérifiant :
 *  1. aucun débordement horizontal de la page (scrollWidth ≤ largeur) ;
 *  2. les boutons, champs et menus restent entièrement dans la fenêtre ;
 *  3. modales, menus déroulants, tiroir de navigation et sélecteur de plage
 *     restent visibles (jamais coupés) ;
 *  4. les formulaires restent utilisables et leurs messages s'affichent ;
 *  5. la liste dynamique de tranches et l'éditeur de contrat par sections
 *     fonctionnent à 375 px.
 * Les soumissions déclenchent volontairement une erreur de validation serveur
 * (montant nul, total ≠ 100 %, date passée) pour prouver l'affichage des
 * messages sans laisser de données aux specs suivants.
 */
const LARGEURS = [320, 375, 768] as const;
const SUFFIXE = Date.now().toString(36).toUpperCase().slice(-4);

async function taille(page: Page, largeur: number) {
  await page.setViewportSize({ width: largeur, height: 740 });
}

/** 1. La page elle-même ne déborde pas horizontalement ; en cas d'échec, les premiers coupables sont nommés. */
async function sansDebordement(page: Page, contexte: string) {
  const etat = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const coupables = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed";
      })
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.dataset.testid ? `[${el.dataset.testid}]` : ""}.${[...el.classList].slice(0, 3).join(".")}`);
    return { scrollWidth: document.documentElement.scrollWidth, vw, coupables };
  });
  expect(etat.scrollWidth, `${contexte} — débordement horizontal (${etat.coupables.join(" ; ") || "aucun élément identifié"})`).toBeLessThanOrEqual(etat.vw);
}

/** 2. / 3. Un élément est entièrement dans la fenêtre (largeur) et, si demandé, en hauteur. */
async function dansLaFenetre(locator: Locator, contexte: string, hauteurAussi = false) {
  await locator.scrollIntoViewIfNeeded();
  // Réessai : les panneaux animés (ressort, fondu) se mesurent une fois stabilisés
  await expect(async () => {
    const box = await locator.boundingBox();
    const vw = await locator.page().evaluate(() => window.innerWidth);
    const vh = await locator.page().evaluate(() => window.innerHeight);
    expect(box, `${contexte} : élément absent`).not.toBeNull();
    expect(box!.x, `${contexte} : dépasse à gauche`).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, `${contexte} : dépasse à droite (${Math.round(box!.x + box!.width)} > ${vw})`).toBeLessThanOrEqual(vw + 1);
    if (hauteurAussi) {
      expect(box!.y, `${contexte} : dépasse en haut`).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height, `${contexte} : dépasse en bas (${Math.round(box!.y + box!.height)} > ${vh})`).toBeLessThanOrEqual(vh + 1);
    }
  }).toPass({ intervals: [100, 250, 500], timeout: 4000 });
}

/** Désactive la validation HTML5 d'un formulaire hydraté pour provoquer une erreur serveur (message affiché). */
async function sansValidationNavigateur(form: Locator) {
  await form.locator('xpath=self::*[@data-hydrated="true"]').waitFor();
  await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true));
}

/** Tiroir de navigation (< 768 px) : ouverture, contenu dans la fenêtre, fermeture. */
async function verifierMenuMobile(page: Page, largeur: number) {
  if (largeur >= 768) {
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    return;
  }
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav).toBeVisible();
  await dansLaFenetre(nav, `menu mobile à ${largeur}px`);
  await dansLaFenetre(page.getByRole("button", { name: "Fermer le menu" }), `bouton Fermer le menu à ${largeur}px`, true);
  await page.getByRole("button", { name: "Fermer le menu" }).click();
  await expect(nav).not.toBeInViewport();
}

/** Sélecteur de plage : panneau entièrement visible, préréglage appliqué. */
async function verifierSelecteurPlage(page: Page, largeur: number) {
  const selecteur = page.getByTestId("selecteur-plage");
  await dansLaFenetre(selecteur.getByTestId("selecteur-plage-bouton"), `bouton de plage à ${largeur}px`);
  await selecteur.getByTestId("selecteur-plage-bouton").click();
  const panneau = selecteur.getByTestId("selecteur-plage-panneau");
  await expect(panneau).toBeVisible();
  await dansLaFenetre(panneau, `panneau de plage à ${largeur}px`, true);
  await selecteur.getByRole("tab", { name: "Personnalisé" }).click();
  await dansLaFenetre(selecteur.getByTestId("plage-appliquer"), `bouton Appliquer du panneau à ${largeur}px`);
  await selecteur.getByRole("tab", { name: "Rapide" }).click();
  await selecteur.getByTestId("plage-rapide-7j").click();
  await expect(page).toHaveURL(/plage=7j/);
  await expect(page.getByTestId("graphiques")).toHaveAttribute("data-plage", "7j");
}

test.describe("audit mobile", () => {
  test("connexion : erreur affichée puis accès, aux trois largeurs", async ({ page }) => {
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.context().clearCookies();
      await page.goto("/login");
      await sansDebordement(page, `login ${largeur}px`);
      await page.getByLabel("Identifiant").fill("PDG-DEMO");
      await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
      await dansLaFenetre(page.getByRole("button", { name: "Se connecter" }), `bouton connexion ${largeur}px`);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByText(/Identifiant ou mot de passe/i)).toBeVisible();
      await sansDebordement(page, `login en erreur ${largeur}px`);
      await page.getByLabel("Mot de passe").fill("demo1234");
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
  });

  test("tableaux de bord des dix rôles internes : menu mobile, sélecteur de plage, graphiques", async ({ page }) => {
    test.setTimeout(600_000);
    // Le Responsable Commercial n'existe pas dans le seed : recruté par le Directeur Commercial (formulaire soumis à 375 px)
    await login(page, "DIRCOM");
    await taille(page, 375);
    await page.goto("/dashboard/equipe");
    await sansDebordement(page, "équipe 375px");
    const formRecrue = page.getByTestId("form-recrue");
    await formRecrue.getByLabel("Nom", { exact: true }).fill(`Mobile${SUFFIXE}`);
    await formRecrue.getByLabel("Prénom").fill("Responsable");
    await formRecrue.locator('select[name="role"]').selectOption({ label: "Responsable Commercial" });
    await dansLaFenetre(page.getByRole("button", { name: "Créer le compte" }), "bouton Créer le compte 375px");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    const acces = page.getByTestId("bloc-acces").first();
    await expect(acces).toBeVisible();
    await dansLaFenetre(acces, "bloc d'accès de la recrue 375px");
    const respCom = { identifiant: (await acces.locator("dd").nth(0).innerText()).trim(), mdp: (await acces.locator("dd").nth(1).innerText()).trim() };

    const comptes: ("PDG" | "DIRCOM" | "COM1" | "RESPADM" | "DIRFIN" | "COMPTA" | "ASSIST" | "SAV" | "RECOUV")[] = ["PDG", "DIRCOM", "COM1", "RESPADM", "DIRFIN", "COMPTA", "ASSIST", "SAV", "RECOUV"];
    for (const compte of comptes) {
      await login(page, compte);
      for (const largeur of LARGEURS) {
        await taille(page, largeur);
        await page.goto("/dashboard?plage=30j");
        await expect(page.getByTestId("graphiques")).toBeVisible();
        await sansDebordement(page, `tableau de bord ${compte} ${largeur}px`);
        await verifierMenuMobile(page, largeur);
        if (compte === "PDG" || largeur === 375) await verifierSelecteurPlage(page, largeur);
        await dansLaFenetre(page.getByTestId("graphique-barres"), `graphique barres ${compte} ${largeur}px`);
      }
    }
    await loginAvec(page, respCom.identifiant, respCom.mdp, /\/dashboard$/);
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard?plage=30j");
      await expect(page.getByTestId("graphiques")).toBeVisible();
      await sansDebordement(page, `tableau de bord Responsable Commercial ${largeur}px`);
      await verifierMenuMobile(page, largeur);
    }
  });

  test("administration : liste des promoteurs, modale du logo, création d'un promoteur soumise à 375 px", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "SUPERADMIN");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/admin");
      await sansDebordement(page, `admin ${largeur}px`);
      await page.getByTestId("bouton-logo-promoteur").first().click();
      const modale = page.getByRole("dialog");
      await expect(modale).toBeVisible();
      await dansLaFenetre(modale, `modale du logo ${largeur}px`, true);
      await dansLaFenetre(modale.getByRole("button", { name: "Enregistrer" }), `bouton Enregistrer de la modale ${largeur}px`, true);
      await page.keyboard.press("Escape");
      await expect(modale).toBeHidden();
      if (largeur === 320) {
        // Écran très bas (320 × 360) : la modale ne dépasse pas la fenêtre et défile en interne
        await page.setViewportSize({ width: 320, height: 360 });
        await page.getByTestId("bouton-logo-promoteur").first().click();
        await expect(modale).toBeVisible();
        await dansLaFenetre(modale, "modale du logo sur écran bas (320 × 360)", true);
        const enregistrer = modale.getByRole("button", { name: "Enregistrer" });
        await enregistrer.scrollIntoViewIfNeeded();
        await dansLaFenetre(enregistrer, "bouton Enregistrer atteint par défilement interne", true);
        await page.keyboard.press("Escape");
        await expect(modale).toBeHidden();
        await taille(page, largeur);
      }
      await page.goto("/admin/nouveau");
      await sansDebordement(page, `admin/nouveau ${largeur}px`);
      await dansLaFenetre(page.getByRole("button", { name: /Créer le promoteur/ }), `bouton de création ${largeur}px`);
    }
    await taille(page, 375);
    await page.goto("/admin/nouveau");
    await page.getByLabel("Nom du promoteur").fill(`Promoteur Mobile ${SUFFIXE}`);
    for (const champ of ["pdg", "dircom", "dirfin"]) {
      await page.locator(`#${champ}Nom`).fill(`${champ} M`);
      await page.locator(`#${champ}Prenom`).fill("Mobile");
    }
    await page.getByRole("button", { name: /Créer le promoteur/ }).click();
    await expect(page.getByTestId("bloc-acces")).toHaveCount(3);
    await sansDebordement(page, "admin/nouveau après création 375px");
    await dansLaFenetre(page.getByTestId("bloc-acces").last(), "dernier bloc d'accès 375px");
  });

  test("projets : liste, détail en grille et en liste, menu d'actions d'un bien", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "DIRCOM");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/projets");
      await sansDebordement(page, `projets ${largeur}px`);
      await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
      await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);
      await sansDebordement(page, `projet grille ${largeur}px`);
      await page.getByTestId("vue-liste").click();
      await expect(page.getByTestId("biens-liste")).toBeVisible();
      await sansDebordement(page, `projet liste ${largeur}px`);
      const menu = page.getByTestId("biens-liste").getByRole("button", { name: "Plus d'actions" }).first();
      await menu.click();
      const items = page.getByRole("menu");
      await expect(items).toBeVisible();
      await dansLaFenetre(items, `menu d'actions d'un bien ${largeur}px`, true);
      await page.keyboard.press("Escape");
      await page.getByTestId("vue-grille").click();
      await expect(page.getByTestId("biens-grille")).toBeVisible();
      await sansDebordement(page, `projet grille (retour) ${largeur}px`);
      await dansLaFenetre(page.getByTestId("form-ajout-bien").getByRole("button", { name: "Ajouter le bien" }), `bouton Ajouter le bien ${largeur}px`);
    }
  });

  test("fiche bien staff : paiement soumis à 375 px avec erreur de validation lisible", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "COM1");
    const href = await hrefBienStaff(page, "Appartement A01");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto(href);
      await sansDebordement(page, `fiche bien ${largeur}px`);
      await dansLaFenetre(page.getByTestId("table-echeancier"), `échéancier de la fiche bien ${largeur}px`);
      const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
      await dansLaFenetre(form.getByRole("button", { name: "Enregistrer le paiement" }), `bouton Enregistrer le paiement ${largeur}px`);
    }
    await taille(page, 375);
    await page.goto(href);
    const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
    await sansValidationNavigateur(form);
    await form.getByLabel("Banque").fill("Banque mobile");
    await form.getByLabel("Date de l'opération").fill(ymd(new Date()));
    await form.getByLabel("Montant", { exact: true }).fill("0");
    await form.getByLabel("Porteur de l'opération").fill("Hamid Naciri");
    await form.getByRole("button", { name: "Enregistrer le paiement" }).click();
    const erreur = form.getByText(/strictement positif|preuve/i).first();
    await expect(erreur).toBeVisible();
    await dansLaFenetre(erreur, "message d'erreur du paiement 375px");
    await sansDebordement(page, "fiche bien après erreur 375px");
    await expect(form.getByLabel("Banque")).toHaveValue("Banque mobile"); // saisie conservée
  });

  test("fiche client : quatre onglets aux trois largeurs, éditeur d'échéancier et de contrat à 375 px", async ({ page }) => {
    test.setTimeout(600_000);
    await login(page, "COM1");
    await page.goto("/dashboard/clients");
    await page.getByRole("link", { name: /Naciri/ }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
    const hrefFiche = page.url().split("?")[0];
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      for (const onglet of ["contrat", "paiements", "tma", "documents"]) {
        await page.goto(`${hrefFiche}?onglet=${onglet}`);
        await expect(page.getByTestId(`onglet-${onglet}`)).toBeVisible();
        await sansDebordement(page, `fiche client · ${onglet} · ${largeur}px`);
        await dansLaFenetre(page.getByTestId("onglets-dossier").getByRole("link", { name: "Documents" }), `onglet Documents visible ${largeur}px`);
      }
    }
    // Liste dynamique de tranches à 375 px : ouvrir, ajouter, retirer, annuler
    await taille(page, 375);
    await page.goto(`${hrefFiche}?onglet=paiements`);
    await page.getByTestId("modifier-echeancier").click();
    const formEch = page.getByTestId("form-echeancier");
    const lignes = formEch.getByTestId("tranche-edition");
    const avant = await lignes.count();
    await formEch.getByTestId("ajouter-tranche").click();
    await expect(lignes).toHaveCount(avant + 1);
    await sansDebordement(page, "éditeur d'échéancier après ajout 375px");
    for (const champ of [`#edition-tranche${avant + 1}Pourcentage`, `#edition-tranche${avant + 1}Date`]) await dansLaFenetre(formEch.locator(champ), `${champ} 375px`);
    await dansLaFenetre(lignes.last().getByTestId("retirer-tranche"), "bouton Retirer de la tranche ajoutée 375px");
    await dansLaFenetre(formEch.getByTestId("enregistrer-echeancier"), "bouton Enregistrer l'échéancier 375px");
    await lignes.last().getByTestId("retirer-tranche").click();
    await expect(lignes).toHaveCount(avant);
    await formEch.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByTestId("modifier-echeancier")).toBeVisible();

    // Éditeur de contrat par sections à 375 px : ajouter, réordonner, supprimer (sans enregistrer)
    await login(page, "RESPADM");
    await taille(page, 375);
    await page.goto(`${hrefFiche}?onglet=contrat`);
    const editeur = page.getByTestId("editeur-contrat");
    const sections = editeur.getByTestId("section-contrat");
    const nb = await sections.count();
    expect(nb).toBeGreaterThan(1);
    await sansDebordement(page, "éditeur de contrat 375px");
    await dansLaFenetre(sections.first().getByRole("button", { name: "Descendre la section" }), "bouton Descendre 375px");
    await dansLaFenetre(editeur.getByTestId("generer-pdf"), "bouton Générer le PDF 375px");
    await editeur.getByTestId("ajouter-section").click();
    await expect(sections).toHaveCount(nb + 1);
    await sections.last().getByLabel("Titre de la section").fill("Section mobile");
    await sections.last().getByRole("button", { name: "Monter la section" }).click();
    await expect(sections.nth(nb - 1).getByLabel("Titre de la section")).toHaveValue("Section mobile");
    await sansDebordement(page, "éditeur de contrat après ajout 375px");
    const supprimer = sections.nth(nb - 1).getByTestId("supprimer-section");
    await supprimer.click();
    await expect(supprimer).toHaveAttribute("data-armed", "true");
    await dansLaFenetre(supprimer, "bouton Supprimer armé 375px");
    await supprimer.click();
    await expect(sections).toHaveCount(nb);
  });

  test("modèle de contrat par défaut : étiquettes, insertion d'un champ et menu déroulant à 320 et 375 px", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "RESPADM");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/contrats/modele");
      await expect(page.getByTestId("editeur-modele")).toBeVisible();
      await sansDebordement(page, `modèle de contrat ${largeur}px`);
      const premiere = page.getByTestId("section-modele").first();
      await dansLaFenetre(premiere.getByTestId("zone-segments"), `zone de texte du modèle ${largeur}px`);
      await premiere.getByTestId("inserer-champ").click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await dansLaFenetre(menu, `menu Insérer un champ ${largeur}px`, true);
      await page.getByRole("menuitem", { name: "Date du jour" }).click();
      await expect(premiere.getByTestId("champ-etiquette").filter({ hasText: "Date du jour" })).toBeVisible();
      await dansLaFenetre(premiere.getByTestId("champ-etiquette").filter({ hasText: "Date du jour" }), `étiquette insérée ${largeur}px`);
      await dansLaFenetre(page.getByTestId("enregistrer-modele"), `bouton Enregistrer le modèle ${largeur}px`);
      // Non enregistré : rien ne change pour les specs suivants
    }
  });

  test("propositions : liste et nouvelle proposition avec tranches dynamiques, soumise à 375 px avec erreur", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "PDG");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/propositions");
      await sansDebordement(page, `propositions ${largeur}px`);
    }
    await login(page, "COM1");
    const href = await hrefBienStaff(page, "Appartement B01");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto(href);
      await page.getByRole("link", { name: "Envoyer une proposition" }).click();
      await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
      await sansDebordement(page, `nouvelle proposition ${largeur}px`);
      const lignes = page.getByTestId("tranche-ligne");
      await page.getByTestId("ajouter-tranche").click();
      await expect(lignes).toHaveCount(5);
      await sansDebordement(page, `nouvelle proposition + tranche ${largeur}px`);
      await dansLaFenetre(page.locator("#tranche5Pourcentage"), `pourcentage de la 5e tranche ${largeur}px`);
      await dansLaFenetre(page.locator("#tranche5Date"), `date de la 5e tranche ${largeur}px`);
      await dansLaFenetre(lignes.last().getByTestId("retirer-tranche"), `bouton Retirer de la 5e tranche ${largeur}px`);
      await lignes.last().getByTestId("retirer-tranche").click();
      await expect(lignes).toHaveCount(4);
    }
    await taille(page, 375);
    await page.goto(href);
    await page.getByRole("link", { name: "Envoyer une proposition" }).click();
    await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
    await page.locator("#tranche4Pourcentage").fill("10"); // total 90 % : refusé sans écriture
    await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
    const erreur = page.getByText(/totalisent 90 %/);
    await expect(erreur).toBeVisible();
    await dansLaFenetre(erreur, "message d'erreur de la proposition 375px");
    await sansDebordement(page, "nouvelle proposition en erreur 375px");
  });

  test("équipe, prospects (assistant et commercial), SAV, recouvrement, finance, journal", async ({ page }) => {
    test.setTimeout(600_000);
    // Équipe : liste et formulaire (soumis plus haut à 375 px)
    await login(page, "DIRCOM");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/equipe");
      await sansDebordement(page, `équipe ${largeur}px`);
      await dansLaFenetre(page.getByRole("button", { name: "Créer le compte" }), `bouton Créer le compte ${largeur}px`);
    }
    // Prospects, vue assistant : panneau d'import ouvert et fichier analysé (aucune écriture sans confirmation)
    await login(page, "ASSIST");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/prospects");
      await sansDebordement(page, `prospects assistant ${largeur}px`);
      await page.getByTestId("bouton-import").click();
      const panneau = page.getByTestId("panneau-import");
      await expect(panneau).toBeVisible();
      await dansLaFenetre(panneau, `panneau d'import ${largeur}px`);
      if (largeur === 375) {
        await page.getByTestId("fichier-import").setInputFiles(classeurXlsx([{ nom: "Prospect Mobile", telephone: "06 99 00 00 01", source: "Avito" }], "mobile.xlsx"));
        await page.getByRole("button", { name: "Analyser le fichier" }).click();
        await expect(page.getByTestId("import-apercu")).toBeVisible();
        await dansLaFenetre(page.getByTestId("import-apercu"), "aperçu de l'import 375px");
        await sansDebordement(page, "prospects aperçu 375px");
      }
    }
    // Prospects, vue commerciale
    await login(page, "COM1");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/prospects");
      await sansDebordement(page, `prospects commercial ${largeur}px`);
    }
    // SAV : syndic soumis avec un montant nul → message d'erreur, aucune écriture
    await login(page, "SAV");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/sav");
      await sansDebordement(page, `SAV ${largeur}px`);
      await dansLaFenetre(page.getByRole("button", { name: "Définir et notifier le client" }), `bouton syndic ${largeur}px`);
    }
    await taille(page, 375);
    await page.goto("/dashboard/sav");
    const formSyndic = page.getByTestId("form-syndic");
    await sansValidationNavigateur(formSyndic);
    await page.locator("#syndic-montant").fill("0");
    await page.getByRole("button", { name: "Définir et notifier le client" }).click();
    const erreurSyndic = formSyndic.getByText(/strictement positif|montant/i).first();
    await expect(erreurSyndic).toBeVisible();
    await dansLaFenetre(erreurSyndic, "erreur syndic 375px");
    // Recouvrement : filtres et formulaire soumis avec un montant nul
    await login(page, "RECOUV");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/recouvrement");
      await sansDebordement(page, `recouvrement ${largeur}px`);
      await page.getByRole("link", { name: "Cette semaine" }).click();
      await expect(page).toHaveURL(/periode=/);
      await sansDebordement(page, `recouvrement filtré ${largeur}px`);
    }
    await taille(page, 375);
    await page.goto("/dashboard/recouvrement");
    await page.getByRole("button", { name: /Ajouter un paiement pour Hamid Naciri/ }).click();
    const formRec = page.locator("form", { has: page.locator('input[name="reference"]') }).first();
    await sansValidationNavigateur(formRec);
    await formRec.getByLabel("Banque").fill("Banque mobile");
    await formRec.getByLabel("Date de l'opération").fill(ymd(new Date()));
    await formRec.getByLabel("Montant", { exact: true }).fill("0");
    await formRec.getByLabel("Porteur de l'opération").fill("Hamid Naciri");
    await formRec.getByLabel("Référence de l'opération").fill(`REF-MOBILE-${SUFFIXE}`);
    await formRec.getByRole("button", { name: "Enregistrer et valider" }).click();
    const erreurRec = formRec.getByText(/strictement positif|preuve/i).first();
    await expect(erreurRec).toBeVisible();
    await dansLaFenetre(erreurRec, "erreur recouvrement 375px");
    await sansDebordement(page, "recouvrement en erreur 375px");
    // Finance et journal
    await login(page, "DIRFIN");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/finance");
      await sansDebordement(page, `finance ${largeur}px`);
      await dansLaFenetre(page.getByTestId("section-projection"), `projection ${largeur}px`);
    }
    await login(page, "PDG");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/dashboard/journal");
      await sansDebordement(page, `journal ${largeur}px`);
      const filtres = page.getByTestId("filtres-journal");
      await dansLaFenetre(filtres, `filtres du journal ${largeur}px`);
      await filtres.getByRole("link", { name: "Création" }).first().click();
      await expect(page).toHaveURL(/action=CREATION/);
      await sansDebordement(page, `journal filtré ${largeur}px`);
    }
  });

  test("espace client : accueil, fiche bien et ses sections, paiement soumis avec erreur, rendez-vous, contact", async ({ page }) => {
    test.setTimeout(600_000);
    await login(page, "CLIENT");
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/client");
      await page.waitForURL(/\/client\/biens\/[^/]+$/);
      await sansDebordement(page, `fiche bien client ${largeur}px`);
      for (const carte of ["carte-bien", "carte-finances", "carte-paiements", "carte-documents", "carte-visite", "carte-photos", "carte-tma", "carte-livraison"]) {
        const el = page.getByTestId(carte);
        if ((await el.count()) === 0) continue;
        await dansLaFenetre(el.first(), `${carte} ${largeur}px`);
      }
      await page.getByRole("button", { name: "Ajouter un paiement" }).click();
      const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
      await expect(form).toBeVisible();
      await sansDebordement(page, `fiche bien client + formulaire ${largeur}px`);
      await dansLaFenetre(form.getByRole("button", { name: "Déclarer ce paiement" }), `bouton Déclarer ce paiement ${largeur}px`);
      if (largeur === 375) {
        await sansValidationNavigateur(form);
        await form.getByLabel("Banque").fill("CIH mobile");
        await form.getByLabel("Date de l'opération").fill(ymd(new Date()));
        await form.getByLabel("Montant", { exact: true }).fill("0");
        await form.getByLabel("Porteur de l'opération").fill("Hamid Naciri");
        await form.getByRole("button", { name: "Déclarer ce paiement" }).click();
        const erreur = form.getByText(/strictement positif|preuve/i).first();
        await expect(erreur).toBeVisible();
        await dansLaFenetre(erreur, "erreur paiement client 375px");
        await expect(form.getByLabel("Banque")).toHaveValue("CIH mobile");
      }
      await page.getByRole("link", { name: "Rendez-vous" }).click();
      await expect(page).toHaveURL(/\/client\/rendez-vous$/);
      await sansDebordement(page, `rendez-vous client ${largeur}px`);
      await page.getByRole("link", { name: "Contacter un service" }).click();
      await expect(page).toHaveURL(/\/client\/contact$/);
      await sansDebordement(page, `contact client ${largeur}px`);
      await dansLaFenetre(page.getByRole("link", { name: "WhatsApp" }).first(), `lien WhatsApp ${largeur}px`);
    }
  });

  // ————————————————————————————————————————————————————————————————————————
  // Complément de l'audit : jeu de données propre au spec (deux biens vendus à
  // un client de test, tout créé à 375 px par les vrais formulaires), chemins
  // de succès, modales et cartes non ouvertes jusqu'ici, éditeurs à 320 px.
  // Nettoyé en fin de spec par désistement traité jusqu'au remboursement.
  // ————————————————————————————————————————————————————————————————————————
  const M = {
    bienX: `Appartement MX${SUFFIXE}`,
    bienY: `Appartement MY${SUFFIXE}`,
    clientNom: `Mobile${SUFFIXE}`,
    clientPrenom: "Audit",
    client: { identifiant: "", mdp: "" },
    hrefX: "",
    hrefY: "",
    hrefFiche: "",
    descriptionTma: `Demande mobile ${SUFFIXE} : déplacer une cloison`,
  };
  const nomClient = () => `${M.clientPrenom} ${M.clientNom}`;
  async function lireAcces(bloc: Locator) {
    const dd = bloc.locator("dd");
    return { identifiant: (await dd.nth(0).innerText()).trim(), mdp: (await dd.nth(1).innerText()).trim() };
  }
  /** Retour à une fenêtre de bureau pour les helpers de navigation (hrefBienStaff). */
  const bureau = (page: Page) => page.setViewportSize({ width: 1280, height: 720 });

  test("mise en place à 375 px : deux biens ajoutés, client créé, deux propositions envoyées puis acceptées ; cartes Accepter / Refuser / Négocier à 320 et 375 px", async ({ page }) => {
    test.setTimeout(420_000);
    await login(page, "DIRCOM");
    await taille(page, 375);
    for (const [designation, prix] of [
      [M.bienX, "500000"],
      [M.bienY, "650000"],
    ] as const) {
      await page.goto("/dashboard/projets");
      await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
      const form = page.getByTestId("form-ajout-bien");
      await form.getByLabel("Désignation").fill(designation);
      await form.getByLabel(/Prix/).fill(prix);
      await form.getByLabel(/Surface/).fill("70");
      await dansLaFenetre(form.getByRole("button", { name: "Ajouter le bien" }), "bouton Ajouter le bien 375px");
      await page.getByRole("button", { name: "Ajouter le bien" }).click();
      await expect(page.getByRole("link", { name: designation, exact: true })).toBeVisible();
      await sansDebordement(page, `projet après ajout de ${designation} 375px`);
    }

    // Client créé par le commercial : formulaire soumis à 375 px, bloc d'accès affiché dans la fenêtre
    await login(page, "COM1");
    await taille(page, 375);
    await page.goto("/dashboard/clients/nouveau");
    await page.getByLabel("Nom", { exact: true }).fill(M.clientNom);
    await page.getByLabel("Prénom").fill(M.clientPrenom);
    await page.getByLabel("Téléphone 1").fill("06 61 00 00 42");
    await page.getByLabel("E-mail").fill(`mobile.${SUFFIXE.toLowerCase()}@exemple.ma`);
    await dansLaFenetre(page.getByRole("button", { name: "Créer le client" }), "bouton Créer le client 375px");
    await page.getByRole("button", { name: "Créer le client" }).click();
    const acces = page.getByTestId("bloc-acces");
    await expect(acces).toBeVisible();
    await dansLaFenetre(acces, "bloc d'accès du client 375px");
    await sansDebordement(page, "nouveau client créé 375px");
    M.client = await lireAcces(acces);

    // Deux propositions envoyées avec des données valides (chemin de succès de la nouvelle proposition à 375 px)
    for (const designation of [M.bienX, M.bienY]) {
      await bureau(page);
      const href = await hrefBienStaff(page, designation);
      await taille(page, 375);
      await page.goto(href);
      await page.getByRole("link", { name: "Envoyer une proposition" }).click();
      await page.locator('[data-testid="form-nouvelle-proposition"][data-hydrated="true"]').waitFor();
      const select = page.locator("#clientId");
      const valeur = await select.evaluate((el, nom) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.includes(nom))?.value ?? "", M.clientNom);
      expect(valeur).not.toBe("");
      await select.selectOption(valeur);
      await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
      await expect(page).toHaveURL(/\/dashboard\/propositions$/);
      const carte = page.locator("[data-card]", { hasText: designation });
      await expect(carte).toBeVisible();
      await dansLaFenetre(carte, `carte de la proposition ${designation} 375px`);
      await sansDebordement(page, `propositions après envoi de ${designation} 375px`);
    }

    // PDG : boutons Accepter / Refuser dans la fenêtre et formulaire Négocier ouvert à 320 et 375 px
    await login(page, "PDG");
    for (const largeur of [320, 375] as const) {
      await taille(page, largeur);
      await page.goto("/dashboard/propositions");
      const carte = page.locator("[data-card]", { hasText: M.bienX });
      await dansLaFenetre(carte.getByRole("button", { name: "Accepter" }), `bouton Accepter ${largeur}px`);
      await dansLaFenetre(carte.getByRole("button", { name: "Refuser" }), `bouton Refuser ${largeur}px`);
      await carte.getByRole("button", { name: "Négocier" }).click();
      const zone = carte.getByLabel("Votre contre-proposition");
      await expect(zone).toBeVisible();
      await dansLaFenetre(zone, `zone de contre-proposition ${largeur}px`);
      await sansDebordement(page, `propositions avec négociation ouverte ${largeur}px`);
    }
    // Acceptation des deux propositions à 375 px
    await taille(page, 375);
    await page.goto("/dashboard/propositions");
    for (const designation of [M.bienX, M.bienY]) {
      const carte = page.locator("[data-card]", { hasText: designation });
      await carte.getByRole("button", { name: "Accepter" }).click();
      await expect(carte.getByText("Acceptée")).toBeVisible();
      await dansLaFenetre(carte.getByText("Acceptée"), `statut Acceptée de ${designation} 375px`);
    }

    await login(page, "COM1");
    await bureau(page);
    M.hrefX = await hrefBienStaff(page, M.bienX);
    M.hrefY = await hrefBienStaff(page, M.bienY);
    await page.goto("/dashboard/clients");
    await page.getByRole("link", { name: new RegExp(`${M.clientPrenom} ${M.clientNom}`) }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
    M.hrefFiche = page.url().split("?")[0];
  });

  test("recherche globale : déclencheur tactile, modale, recherche réelle et résultat cliqué à 320 et 375 px", async ({ page }) => {
    await login(page, "COM1");
    for (const largeur of [320, 375] as const) {
      await taille(page, largeur);
      await page.goto("/dashboard");
      const bouton = page.getByTestId("ouvrir-recherche");
      await expect(bouton).toBeVisible();
      await dansLaFenetre(bouton, `bouton de recherche ${largeur}px`, true);
      await bouton.click();
      const modale = page.getByRole("dialog", { name: "Recherche" });
      await expect(modale).toBeVisible();
      await dansLaFenetre(modale, `modale de recherche ${largeur}px`, true);
      await modale.getByTestId("champ-recherche").fill(M.clientNom);
      const resultat = modale.getByTestId("resultat-recherche").filter({ hasText: M.clientNom }).first();
      await expect(resultat).toBeVisible();
      await dansLaFenetre(resultat, `résultat de recherche ${largeur}px`, true);
      await resultat.click();
      await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+/);
      await expect(page.getByRole("heading", { name: new RegExp(M.clientNom) })).toBeVisible();
      await sansDebordement(page, `fiche client atteinte par la recherche ${largeur}px`);
    }
  });

  test("espace client, accueil : client à deux biens, liste réellement affichée aux trois largeurs et sélection d'un bien", async ({ page }) => {
    await loginAvec(page, M.client.identifiant, M.client.mdp, /\/client$/);
    for (const largeur of LARGEURS) {
      await taille(page, largeur);
      await page.goto("/client");
      await expect(page).toHaveURL(/\/client$/);
      const cartes = page.getByTestId("client-bien-carte");
      await expect(cartes).toHaveCount(2);
      await sansDebordement(page, `accueil client ${largeur}px`);
      await dansLaFenetre(cartes.first(), `carte du premier bien ${largeur}px`);
      await dansLaFenetre(cartes.last(), `carte du second bien ${largeur}px`);
      await cartes.filter({ hasText: M.bienY }).click();
      await expect(page).toHaveURL(/\/client\/biens\/[^/]+$/);
      await expect(page.getByRole("heading", { name: M.bienY })).toBeVisible();
      await sansDebordement(page, `fiche du bien ${M.bienY} depuis l'accueil ${largeur}px`);
    }
  });

  test("chemins de succès à 375 px, côté staff : paiement sur la fiche bien, import de prospects confirmé, syndic défini, encaissement au recouvrement", async ({ page }) => {
    test.setTimeout(300_000);
    // Fiche bien : paiement enregistré par le commercial avec des données valides
    await login(page, "COM1");
    await taille(page, 375);
    await page.goto(M.hrefX);
    const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
    await form.getByLabel("Banque").fill("Banque mobile");
    await form.getByLabel("Date de l'opération").fill(ymd(new Date()));
    await form.getByLabel("Montant", { exact: true }).fill("50000");
    await form.getByLabel("Porteur de l'opération").fill(nomClient());
    await deposerFichier(form, "preuveUrl", [{ name: "preuve-mobile.png" }]);
    await form.getByRole("button", { name: "Enregistrer le paiement" }).click();
    const succes = page.getByTestId("paiement-succes");
    await expect(succes).toBeVisible();
    await dansLaFenetre(succes, "message de succès du paiement 375px");
    await sansDebordement(page, "fiche bien après paiement 375px");

    // Prospects : import analysé puis confirmé
    await login(page, "ASSIST");
    await taille(page, 375);
    await page.goto("/dashboard/prospects");
    await page.getByTestId("bouton-import").click();
    await page.getByTestId("fichier-import").setInputFiles(classeurXlsx([{ nom: `Prospect Mobile ${SUFFIXE}`, telephone: "06 99 00 00 42", source: "Avito" }], "mobile-import.xlsx"));
    await page.getByRole("button", { name: "Analyser le fichier" }).click();
    await expect(page.getByTestId("import-apercu")).toBeVisible();
    await dansLaFenetre(page.getByTestId("confirmer-import"), "bouton Confirmer l'import 375px");
    await page.getByTestId("confirmer-import").click();
    const importSucces = page.getByTestId("import-succes");
    await expect(importSucces).toContainText("1 prospect importé");
    await dansLaFenetre(importSucces, "message de succès de l'import 375px");
    await expect(page.getByTestId("prospect-ligne").filter({ hasText: `Prospect Mobile ${SUFFIXE}` })).toHaveCount(1);
    await sansDebordement(page, "prospects après import 375px");

    // SAV : part de syndic définie pour le bien X, client notifié
    await login(page, "SAV");
    await taille(page, 375);
    await page.goto("/dashboard/sav");
    const select = page.locator("#syndic-bien");
    const valeur = await select.evaluate((el, nom) => [...(el as HTMLSelectElement).options].find((o) => o.textContent?.startsWith(nom))?.value ?? "", M.bienX);
    expect(valeur).not.toBe("");
    await select.selectOption(valeur);
    await page.locator("#syndic-montant").fill("6000");
    await page.getByRole("button", { name: "Définir et notifier le client" }).click();
    const syndicSucces = page.getByText("Montant enregistré, client notifié.");
    await expect(syndicSucces).toBeVisible();
    await dansLaFenetre(syndicSucces, "message de succès du syndic 375px");
    await sansDebordement(page, "SAV après syndic 375px");

    // Recouvrement : encaissement constaté et validé pour le client de test
    await login(page, "RECOUV");
    await taille(page, 375);
    await page.goto("/dashboard/recouvrement");
    await page.getByRole("button", { name: `Ajouter un paiement pour ${nomClient()}` }).first().click();
    const formRec = page.locator("form", { has: page.locator('input[name="reference"]') }).first();
    await formRec.getByLabel("Banque").fill("Banque mobile");
    await formRec.getByLabel("Date de l'opération").fill(ymd(new Date()));
    await formRec.getByLabel("Montant", { exact: true }).fill("20000");
    await formRec.getByLabel("Porteur de l'opération").fill(nomClient());
    await formRec.getByLabel("Référence de l'opération").fill(`REF-MOBILE-${SUFFIXE}`);
    await deposerFichier(formRec, "preuveUrl", [{ name: "preuve-recouvrement.png" }]);
    await formRec.getByRole("button", { name: "Enregistrer et valider" }).click();
    const recSucces = page.getByText(new RegExp(`Paiement enregistré et validé pour ${nomClient()}`));
    await expect(recSucces).toBeVisible();
    await dansLaFenetre(recSucces, "message de succès du recouvrement 375px");
    await sansDebordement(page, "recouvrement après encaissement 375px");
  });

  test("chemins de succès à 375 px, espace client : paiement déclaré, demande de modification, rendez-vous proposé ; cartes Livraison / Visite / Photos / Syndic à 320 et 375 px", async ({ page }) => {
    test.setTimeout(300_000);
    await loginAvec(page, M.client.identifiant, M.client.mdp, /\/client$/);
    await taille(page, 375);
    // Bien Y : paiement déclaré avec des données valides
    await page.goto("/client");
    await page.getByTestId("client-bien-carte").filter({ hasText: M.bienY }).click();
    await expect(page.getByRole("heading", { name: M.bienY })).toBeVisible();
    await page.getByRole("button", { name: "Ajouter un paiement" }).click();
    const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
    await form.getByLabel("Banque").fill("CIH mobile");
    await form.getByLabel("Date de l'opération").fill(ymd(new Date()));
    await form.getByLabel("Montant", { exact: true }).fill("30000");
    await form.getByLabel("Porteur de l'opération").fill(nomClient());
    await deposerFichier(form, "preuveUrl", [{ name: "preuve-client-mobile.png" }]);
    await form.getByRole("button", { name: "Déclarer ce paiement" }).click();
    const succes = page.getByText(/Paiement déclaré/);
    await expect(succes).toBeVisible();
    await dansLaFenetre(succes, "message de succès du paiement client 375px");
    await sansDebordement(page, "fiche bien client après paiement 375px");

    // Bien X : demande de travaux modificatifs
    await page.goto("/client");
    await page.getByTestId("client-bien-carte").filter({ hasText: M.bienX }).click();
    await expect(page.getByRole("heading", { name: M.bienX })).toBeVisible();
    const hrefX = page.url();
    const section = page.getByTestId("section-tma");
    await section.getByRole("button", { name: "Demander une modification" }).click();
    await section.getByLabel("Modification souhaitée").fill(M.descriptionTma);
    await section.getByRole("button", { name: "Envoyer la demande" }).click();
    const tmaSucces = section.getByTestId("tma-succes");
    await expect(tmaSucces).toBeVisible();
    await dansLaFenetre(tmaSucces, "message de succès de la demande TMA 375px");
    await sansDebordement(page, "fiche bien client après demande TMA 375px");

    // Cartes Livraison / Visite / Photos / Syndic : chaque bouton dans la fenêtre à 320 et 375 px
    for (const largeur of [320, 375] as const) {
      await taille(page, largeur);
      await page.goto(hrefX);
      for (const carte of ["carte-livraison", "carte-visite", "carte-photos", "carte-syndic"]) {
        const el = page.getByTestId(carte);
        await expect(el).toBeVisible();
        await dansLaFenetre(el, `${carte} ${largeur}px`);
        const boutons = el.getByRole("button");
        const nb = await boutons.count();
        for (let i = 0; i < nb; i++) await dansLaFenetre(boutons.nth(i), `bouton ${i + 1} de ${carte} ${largeur}px`);
      }
      await sansDebordement(page, `fiche bien client, cartes ${largeur}px`);
    }
    // Actions réelles à 375 px : visite demandée, photos demandées, formulaire syndic ouvert, livraison confirmée
    await taille(page, 375);
    await page.goto(hrefX);
    await page.getByTestId("carte-visite").getByRole("button", { name: "Demander une visite" }).click();
    await expect(page.getByTestId("carte-visite").getByText("Demande de visite en attente du SAV")).toBeVisible();
    await page.getByTestId("carte-photos").getByRole("button", { name: "Demander des photos" }).click();
    await expect(page.getByTestId("carte-photos").getByText("Demande transmise au SAV")).toBeVisible();
    await page.getByTestId("carte-syndic").getByRole("button", { name: "Déclarer mon paiement" }).click();
    const formSyndic = page.getByTestId("carte-syndic").locator("form");
    await expect(formSyndic).toBeVisible();
    await dansLaFenetre(formSyndic.getByRole("button", { name: "Envoyer au service comptable" }), "bouton du formulaire syndic 375px");
    await sansDebordement(page, "fiche bien client, formulaire syndic ouvert 375px");
    await page.getByTestId("carte-livraison").getByRole("button", { name: /Confirmer tout/ }).click();
    const livraison = page.getByText("Votre confirmation est enregistrée");
    await expect(livraison).toBeVisible();
    await dansLaFenetre(livraison, "confirmation de livraison 375px");
    await sansDebordement(page, "fiche bien client après confirmation de livraison 375px");

    // Rendez-vous proposé au SAV
    await page.goto("/client/rendez-vous");
    await page.locator('select[name="service"]').selectOption("SAV");
    await page.locator('input[name="date"]').fill(`${ymd(prochainJour(1))}T10:00`);
    await page.locator('textarea[name="notes"]').fill(`Rendez-vous mobile ${SUFFIXE}`);
    await dansLaFenetre(page.getByRole("button", { name: "Proposer ce rendez-vous" }), "bouton Proposer ce rendez-vous 375px");
    await page.getByRole("button", { name: "Proposer ce rendez-vous" }).click();
    const rdvSucces = page.getByTestId("rdv-succes");
    await expect(rdvSucces).toBeVisible();
    await dansLaFenetre(rdvSucces, "message de succès du rendez-vous 375px");
    await sansDebordement(page, "rendez-vous après proposition 375px");
  });

  test("cartes TMA : chiffrage depuis le SAV puis la fiche client à 320 et 375 px, devis envoyé à 375 px, acceptation ouverte côté client", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "SAV");
    for (const largeur of [320, 375] as const) {
      await taille(page, largeur);
      await page.goto("/dashboard/sav");
      const carteIndex = page.getByTestId("tma-carte").filter({ hasText: M.descriptionTma });
      await expect(carteIndex).toBeVisible();
      await dansLaFenetre(carteIndex, `carte TMA de l'index SAV ${largeur}px`);
      await carteIndex.getByTestId("lien-fiche-client").click();
      await expect(page.getByTestId("onglet-tma")).toBeVisible();
      const carte = page.getByTestId("onglet-tma").getByTestId("tma-carte").filter({ hasText: M.descriptionTma });
      await dansLaFenetre(carte.getByTestId("tma-chiffrer"), `bouton Chiffrer ${largeur}px`);
      await carte.getByTestId("tma-chiffrer").click();
      const formChiffrage = carte.getByTestId("form-chiffrage");
      await expect(formChiffrage).toBeVisible();
      await dansLaFenetre(formChiffrage.getByRole("button", { name: "Envoyer le devis au client" }), `bouton Envoyer le devis ${largeur}px`);
      await sansDebordement(page, `fiche client, chiffrage TMA ouvert ${largeur}px`);
      if (largeur === 375) {
        await formChiffrage.getByLabel("Montant du devis (MAD)").fill("12000");
        await deposerFichier(formChiffrage, "devisUrl", [{ name: "devis-mobile.pdf" }]);
        await formChiffrage.getByRole("button", { name: "Envoyer le devis au client" }).click();
        await expect(carte.getByText(/12.000 MAD/)).toBeVisible();
        await sansDebordement(page, "fiche client après envoi du devis 375px");
      }
    }
    await loginAvec(page, M.client.identifiant, M.client.mdp, /\/client$/);
    for (const largeur of [320, 375] as const) {
      await taille(page, largeur);
      await page.goto("/client");
      await page.getByTestId("client-bien-carte").filter({ hasText: M.bienX }).click();
      const demande = page.getByTestId("demande-tma").filter({ hasText: M.descriptionTma });
      const acceptation = demande.getByTestId("form-acceptation-devis");
      await expect(acceptation).toBeVisible();
      await dansLaFenetre(acceptation.getByRole("button", { name: "Accepter le devis" }), `bouton Accepter le devis ${largeur}px`);
      await sansDebordement(page, `fiche bien client, devis à accepter ${largeur}px`);
    }
  });

  test("modales de la liste des biens : Bloquer (PDG) et Supprimer (Directeur Commercial) ouvertes à 320 et 375 px puis annulées", async ({ page }) => {
    test.setTimeout(300_000);
    for (const [compte, item] of [
      ["PDG", "Bloquer ce bien"],
      ["DIRCOM", "Supprimer le bien"],
    ] as const) {
      await login(page, compte);
      for (const largeur of [320, 375] as const) {
        await taille(page, largeur);
        await page.goto("/dashboard/projets");
        await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
        await page.getByTestId("vue-liste").click();
        const ligne = page.getByTestId("bien-ligne").filter({ hasText: "Appartement B01" });
        await ligne.getByRole("button", { name: "Plus d'actions" }).click();
        await page.getByRole("menuitem", { name: item }).click();
        const modale = page.getByRole("dialog");
        await expect(modale).toBeVisible();
        await dansLaFenetre(modale, `modale « ${item} » ${largeur}px`, true);
        await dansLaFenetre(modale.getByRole("button", { name: "Annuler" }), `bouton Annuler de la modale ${largeur}px`, true);
        await modale.getByRole("button", { name: "Annuler" }).click();
        await expect(modale).toBeHidden();
      }
    }
  });

  test("éditeurs à 320 px : échéancier (ajout, retrait) et contrat par sections (ajout, réordonnancement, suppression)", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "COM1");
    await taille(page, 320);
    await page.goto(`${M.hrefFiche}?onglet=paiements`);
    await page.getByTestId("modifier-echeancier").click();
    const formEch = page.getByTestId("form-echeancier");
    const lignes = formEch.getByTestId("tranche-edition");
    const avant = await lignes.count();
    await formEch.getByTestId("ajouter-tranche").click();
    await expect(lignes).toHaveCount(avant + 1);
    await sansDebordement(page, "éditeur d'échéancier après ajout 320px");
    for (const champ of [`#edition-tranche${avant + 1}Pourcentage`, `#edition-tranche${avant + 1}Date`]) await dansLaFenetre(formEch.locator(champ), `${champ} 320px`);
    await dansLaFenetre(lignes.last().getByTestId("retirer-tranche"), "bouton Retirer de la tranche ajoutée 320px");
    await dansLaFenetre(formEch.getByTestId("enregistrer-echeancier"), "bouton Enregistrer l'échéancier 320px");
    await lignes.last().getByTestId("retirer-tranche").click();
    await expect(lignes).toHaveCount(avant);
    await formEch.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByTestId("modifier-echeancier")).toBeVisible();

    await login(page, "RESPADM");
    await taille(page, 320);
    await page.goto(`${M.hrefFiche}?onglet=contrat`);
    const editeur = page.getByTestId("editeur-contrat");
    const sections = editeur.getByTestId("section-contrat");
    const nb = await sections.count();
    expect(nb).toBeGreaterThan(1);
    await sansDebordement(page, "éditeur de contrat 320px");
    await dansLaFenetre(sections.first().getByRole("button", { name: "Descendre la section" }), "bouton Descendre 320px");
    await dansLaFenetre(editeur.getByTestId("generer-pdf"), "bouton Générer le PDF 320px");
    await editeur.getByTestId("ajouter-section").click();
    await expect(sections).toHaveCount(nb + 1);
    await sections.last().getByLabel("Titre de la section").fill("Section mobile 320");
    await sections.last().getByRole("button", { name: "Monter la section" }).click();
    await expect(sections.nth(nb - 1).getByLabel("Titre de la section")).toHaveValue("Section mobile 320");
    await sansDebordement(page, "éditeur de contrat après ajout 320px");
    const supprimer = sections.nth(nb - 1).getByTestId("supprimer-section");
    await supprimer.click();
    await expect(supprimer).toHaveAttribute("data-armed", "true");
    await dansLaFenetre(supprimer, "bouton Supprimer armé 320px");
    await supprimer.click();
    await expect(sections).toHaveCount(nb);
  });

  test("validation comptable à 375 px : les deux paiements en attente du client de test sont référencés et validés depuis la fiche", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "COMPTA");
    await taille(page, 375);
    for (const designation of [M.bienX, M.bienY]) {
      await page.goto("/dashboard/paiements");
      const carteIndex = page.locator("[data-card]", { hasText: designation }).filter({ hasText: "Tranche 1" });
      await expect(carteIndex).toHaveCount(1);
      await dansLaFenetre(carteIndex.getByTestId("lien-fiche-client"), `lien vers la fiche depuis l'index des paiements (${designation}) 375px`);
      await carteIndex.getByTestId("lien-fiche-client").click();
      await expect(page).toHaveURL(/\/dashboard\/clients\/[^/?]+\?bien=[^&]+&onglet=paiements$/);
      await sansDebordement(page, `fiche client, onglet paiements (${designation}) 375px`);
      const carte = page.getByTestId("onglet-paiements").locator("[data-card]", { hasText: "Tranche 1" }).filter({ has: page.getByTestId("form-completer") });
      await expect(carte).toHaveCount(1);
      await carte.getByLabel("Référence").fill(`REF-VALID-${SUFFIXE}-${designation.slice(-6)}`);
      await carte.getByLabel("Date de réception").fill(ymd(new Date()));
      await dansLaFenetre(carte.getByRole("button", { name: "Valider" }), `bouton Valider (${designation}) 375px`);
      await carte.getByRole("button", { name: "Valider" }).click();
      const vide = page.getByTestId("onglet-paiements").getByText("Aucune opération en attente");
      await expect(vide).toBeVisible();
      await dansLaFenetre(vide, `état « aucune opération en attente » (${designation}) 375px`);
      await expect(page.getByTestId("ligne-paiement").filter({ hasText: `REF-VALID-${SUFFIXE}-${designation.slice(-6)}` })).toHaveCount(1);
    }
    await page.goto("/dashboard/paiements");
    await expect(page.locator("[data-card]", { hasText: M.clientNom }).filter({ has: page.getByTestId("lien-fiche-client") })).toHaveCount(0);
  });

  test("nettoyage : désistement des deux biens du client de test, traité jusqu'au remboursement", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "COM1");
    await bureau(page);
    for (const href of [M.hrefX, M.hrefY]) {
      await page.goto(href);
      await page.getByRole("button", { name: "Enregistrer un désistement" }).click();
      const form = page.locator("form", { has: page.locator('input[name="documentUrl"]') });
      await deposerFichier(form, "documentUrl", [{ name: "desistement-mobile.png" }]);
      await form.getByRole("button", { name: "Confirmer le désistement" }).click();
      await expect(page).toHaveURL(/\/dashboard\/desistes$/);
    }
    await login(page, "RESPADM");
    await page.goto(M.hrefFiche);
    const selecteur = page.getByTestId("selecteur-biens-client");
    for (const designation of [M.bienX, M.bienY]) {
      await selecteur.getByRole("link", { name: `${designation} (désisté)` }).click();
      await expect(page.getByTestId("bien-selectionne")).toHaveText(designation);
      await page.getByTestId("onglets-dossier").getByRole("link", { name: "Contrat" }).click();
      const dossier = page.getByTestId("section-desistement").getByTestId("desistement-carte");
      await dossier.getByRole("button", { name: "Papiers vérifiés" }).click();
      await dossier.getByLabel("Décharge").fill("Nettoyage de l'audit mobile");
      await dossier.getByRole("button", { name: "Marquer remboursé" }).click();
      await expect(dossier.getByText("Remboursé", { exact: true })).toBeVisible();
    }
    await page.goto("/dashboard/desistements");
    await expect(page.getByText("Aucun désistement en attente")).toBeVisible();
  });

});
