import { expect, test, type Page } from "@playwright/test";
import { login, classeurXlsx } from "./helpers";
import { verifierA11y } from "./a11y";

/*
 * Accessibilité du design system : analyse axe-core (WCAG A / AA) sur un
 * échantillon de pages couvrant chaque famille de composant, au repos ET
 * dans leurs états interactifs, plus des vérifications clavier / ARIA que
 * l'analyse automatique ne couvre pas (piège de focus, retour de focus,
 * navigation aux flèches, aria-sort, aria-live, préférence de mouvement
 * réduit).
 *
 * Aucune donnée n'est modifiée : les modales et menus sont ouverts puis
 * refermés sans confirmation.
 */

/** Page du projet de démonstration (BiensExplorer). */
async function ouvrirProjet(page: Page) {
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);
  await expect(page.getByTestId("bien-carte").first()).toBeVisible();
}

/** Carte (vue grille) d'un bien encore disponible : le PDG peut y ouvrir la modale de blocage. */
function carteBloquable(page: Page) {
  return page.getByTestId("bien-carte").filter({ has: page.getByRole("button", { name: "Bloquer ce bien" }) }).first();
}

/**
 * Observe la prochaine modale insérée : relève, image par image, sa
 * transformation CSS jusqu'à ce qu'elle atteigne l'identité (position finale).
 */
async function observerModale(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __modale: { delai: number | null; etapes: string[] } };
    w.__modale = { delai: null, etapes: [] };
    new MutationObserver(() => {
      const d = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (!d || d.dataset.observe) return;
      d.dataset.observe = "1";
      const debut = performance.now();
      const tick = () => {
        const t = getComputedStyle(d).transform;
        if (w.__modale.etapes[w.__modale.etapes.length - 1] !== t) w.__modale.etapes.push(t);
        if (t === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)) {
          w.__modale.delai = performance.now() - debut;
          return;
        }
        if (performance.now() - debut < 2000) requestAnimationFrame(tick);
      };
      tick();
    }).observe(document.body, { childList: true, subtree: true });
  });
}

/** Délai (ms) avant la position finale et nombre de valeurs de transformation distinctes traversées. */
async function trajetModale(page: Page) {
  const m = await page.evaluate(() => (window as unknown as { __modale: { delai: number | null; etapes: string[] } }).__modale);
  expect(m.delai, "la modale n'a jamais atteint sa position finale").not.toBeNull();
  return { delai: m.delai as number, etapes: m.etapes.length };
}

/** L'élément qui a le focus est-il à l'intérieur du sélecteur donné ? */
async function focusDans(page: Page, selecteur: string) {
  return page.evaluate((sel) => !!document.activeElement?.closest(sel), selecteur);
}

test.describe("Accessibilité — analyse axe des pages", () => {
  test("page de connexion (champs à étiquette flottante)", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    await verifierA11y(page, "/login au repos");

    // Étiquette flottante : le <label for> reste associé au champ, y compris réduit (champ rempli)
    await page.getByLabel("Identifiant").fill("PDG-DEMO");
    await page.getByLabel("Mot de passe").fill("x");
    for (const id of ["identifiant", "motDePasse"]) {
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await expect(page.getByLabel("Identifiant")).toHaveValue("PDG-DEMO");
    await verifierA11y(page, "/login champs remplis");
  });

  test("administration plateforme (DataTable, ConfirmButton, formulaire)", async ({ page }) => {
    await login(page, "SUPERADMIN");
    await verifierA11y(page, "/admin");
    await page.goto("/admin/nouveau");
    await expect(page.getByRole("button", { name: /Créer le promoteur/ })).toBeVisible();
    await verifierA11y(page, "/admin/nouveau");
  });

  test("tableau de bord et coquille (sidebar, cloche)", async ({ page }) => {
    await login(page, "PDG");
    await verifierA11y(page, "/dashboard au repos");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
    await verifierA11y(page, "/dashboard cloche ouverte");
  });

  test("liste des biens d'un projet, vue grille puis vue liste", async ({ page }) => {
    await login(page, "PDG");
    await ouvrirProjet(page);
    await verifierA11y(page, "projet vue grille");
    await page.getByTestId("vue-liste").click();
    await expect(page.getByTestId("bien-ligne").first()).toBeVisible();
    await verifierA11y(page, "projet vue liste");
  });

  test("modale ouverte (blocage d'un bien par le PDG)", async ({ page }) => {
    await login(page, "PDG");
    await ouvrirProjet(page);
    await carteBloquable(page).getByRole("button", { name: "Bloquer ce bien" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: /Bloquer/ })).toBeVisible();
    await verifierA11y(page, "modale de blocage ouverte");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Bloquer/ })).toHaveCount(0);
  });

  test("menu déroulant ouvert (actions d'un bien, vue liste)", async ({ page }) => {
    await login(page, "PDG");
    await ouvrirProjet(page);
    await page.getByTestId("vue-liste").click();
    const ligne = page.getByTestId("bien-ligne").filter({ has: page.getByRole("button", { name: "Plus d'actions" }) }).first();
    await ligne.getByRole("button", { name: "Plus d'actions" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await verifierA11y(page, "menu d'actions ouvert");
    await page.keyboard.press("Escape");
  });

  test("import des prospects : panneau ouvert puis aperçu de la répartition (aucune écriture)", async ({ page }) => {
    await login(page, "ASSIST");
    await page.goto("/dashboard/prospects");
    await page.getByTestId("bouton-import").click();
    await expect(page.getByTestId("panneau-import")).toBeVisible();
    await verifierA11y(page, "/dashboard/prospects panneau d'import ouvert");
    await page
      .getByTestId("fichier-import")
      .setInputFiles(classeurXlsx([{ nom: "Aperçu A11y", telephone: "06 99 00 00 01", source: "Avito" }, { nom: "Sans tel", telephone: "", source: "" }], "a11y.xlsx"));
    await page.getByRole("button", { name: "Analyser le fichier" }).click();
    await expect(page.getByTestId("import-apercu")).toBeVisible();
    await verifierA11y(page, "/dashboard/prospects aperçu d'import");
  });

  test("recherche globale ouverte (Ctrl+K) avec résultats", async ({ page }) => {
    await login(page, "PDG");
    await page.keyboard.press("Control+k");
    const dialogue = page.getByRole("dialog", { name: "Recherche" });
    await expect(dialogue).toBeVisible();
    await dialogue.getByTestId("champ-recherche").fill("a0");
    await expect(dialogue.getByTestId("groupe-bien")).toBeVisible();
    await verifierA11y(page, "recherche globale ouverte");
    await page.keyboard.press("Escape");
  });

  test("recouvrement (contrôle segmenté, DataTable dense, tuiles)", async ({ page }) => {
    await login(page, "RECOUV");
    await page.goto("/dashboard/recouvrement");
    await expect(page.getByRole("navigation", { name: "Période" })).toBeVisible();
    await verifierA11y(page, "/dashboard/recouvrement");
  });

  test("fiche bien côté staff (formulaire de paiement à étiquettes flottantes)", async ({ page }) => {
    await login(page, "COM1");
    await ouvrirProjet(page);
    await page.getByRole("link", { name: "Appartement A01", exact: true }).click();
    await expect(page.getByText("Saisir un encaissement")).toBeVisible();
    await verifierA11y(page, "/dashboard/biens/[id] vendu");
  });

  test("espace client : fiche bien au repos et formulaire de paiement ouvert", async ({ page }) => {
    await login(page, "CLIENT");
    await expect(page.getByRole("heading", { name: "Appartement A01" })).toBeVisible();
    await verifierA11y(page, "/client/biens/[id] au repos");
    await page.getByRole("button", { name: "Ajouter un paiement" }).click();
    const form = page.locator("form", { has: page.locator('input[name="preuveUrl"]') });
    await expect(form).toBeVisible();
    // Étiquettes flottantes des <select> et <input> : association programmatique for/id
    for (const libelle of ["Tranche concernée", "Nature de l'opération", "Banque", "Date de l'opération", "Porteur de l'opération"]) {
      const champ = form.getByLabel(libelle);
      await expect(champ).toBeVisible();
      const id = await champ.getAttribute("id");
      expect(id, `${libelle} doit porter un id`).toBeTruthy();
      await expect(form.locator(`label[for="${id}"]`)).toHaveText(new RegExp(libelle));
    }
    await verifierA11y(page, "/client/biens/[id] paiement ouvert");
    await page.goto("/client/rendez-vous");
    await expect(page.getByRole("button", { name: "Proposer ce rendez-vous" })).toBeVisible();
    await verifierA11y(page, "/client/rendez-vous");
  });
});

test.describe("Accessibilité — clavier et ARIA", () => {
  test("modale : piège de focus, Échap, retour du focus sur le déclencheur", async ({ page }) => {
    await login(page, "PDG");
    await ouvrirProjet(page);
    const declencheur = carteBloquable(page).getByRole("button", { name: "Bloquer ce bien" });
    await declencheur.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: /Bloquer/ });
    await expect(dialog).toBeVisible();

    // Focus initial à l'intérieur (premier champ)
    expect(await focusDans(page, '[role="dialog"]')).toBe(true);
    await expect(dialog.getByLabel(/Commentaire/)).toBeFocused();

    // Tab en boucle : jamais en dehors de la modale
    const nbFocalisables = await dialog.locator('button:not([disabled]), textarea, input, a[href]').count();
    for (let i = 0; i < nbFocalisables + 2; i++) {
      await page.keyboard.press("Tab");
      expect(await focusDans(page, '[role="dialog"]'), `Tab n°${i + 1} sort de la modale`).toBe(true);
    }
    // Shift+Tab depuis le premier élément du DOM (croix) → dernier (bouton d'action), et inversement
    await dialog.getByRole("button", { name: "Fermer" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Bloquer ce bien" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Fermer" })).toBeFocused();

    // Échap ferme et rend le focus au déclencheur
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(declencheur).toBeFocused();
  });

  test("modale ouverte depuis le menu déroulant : le focus revient au bouton du menu", async ({ page }) => {
    await login(page, "PDG");
    await ouvrirProjet(page);
    await page.getByTestId("vue-liste").click();
    const ligne = page.getByTestId("bien-ligne").filter({ has: page.getByRole("button", { name: "Plus d'actions" }) }).first();
    const trigger = ligne.getByRole("button", { name: "Plus d'actions" });
    await trigger.click();
    await page.getByRole("menuitem", { name: "Bloquer ce bien" }).click();
    const dialog = page.getByRole("dialog", { name: /Bloquer/ });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("menu déroulant : aria-expanded, flèches, Home/End, Échap", async ({ page }) => {
    await login(page, "DIRCOM");
    await ouvrirProjet(page);
    await page.getByTestId("vue-liste").click();
    const ligne = page.getByTestId("bien-ligne").filter({ has: page.getByRole("button", { name: "Plus d'actions" }) }).first();
    const trigger = ligne.getByRole("button", { name: "Plus d'actions" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    // Ouverture au clavier
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const items = menu.getByRole("menuitem");
    const n = await items.count();
    expect(n).toBeGreaterThan(0);
    await expect(items.first()).toBeFocused();

    if (n > 1) {
      await page.keyboard.press("ArrowDown");
      await expect(items.nth(1)).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(items.first()).toBeFocused();
    }
    await page.keyboard.press("End");
    await expect(items.nth(n - 1)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(items.first()).toBeFocused();

    // Échap : fermeture et focus rendu au déclencheur
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("contrôle segmenté du recouvrement : flèches, Home/End, Entrée", async ({ page }) => {
    await login(page, "RECOUV");
    await page.goto("/dashboard/recouvrement");
    const nav = page.getByRole("navigation", { name: "Période" });
    const segments = nav.getByRole("link");
    await expect(segments.first()).toHaveAttribute("aria-current", "page");

    await segments.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(segments.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(segments.first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(segments.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(segments.first()).toBeFocused();

    // Entrée active le segment focalisé (navigation par l'URL)
    await nav.getByRole("link", { name: "Cette semaine" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/periode=semaine/);
    await expect(nav.getByRole("link", { name: "Cette semaine" })).toHaveAttribute("aria-current", "page");

    // Espace active aussi un segment lien (comportement natif absent sur <a>)
    await nav.getByRole("link", { name: "Toutes" }).focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/dashboard\/recouvrement$/);
  });

  test("DataTable : aria-sort none → ascending → descending → none", async ({ page }) => {
    await login(page, "SUPERADMIN");
    const entete = page.locator("th", { hasText: "Promoteur" }).first();
    await expect(entete).toHaveAttribute("aria-sort", "none");
    const bouton = entete.getByRole("button");
    await bouton.click();
    await expect(entete).toHaveAttribute("aria-sort", "ascending");
    await bouton.click();
    await expect(entete).toHaveAttribute("aria-sort", "descending");
    await bouton.click();
    await expect(entete).toHaveAttribute("aria-sort", "none");
    // Une colonne non triable n'annonce aucun tri
    await expect(page.locator("th", { hasText: "Abonnement" })).not.toHaveAttribute("aria-sort", /.+/);
  });

  test("toasts : région aria-live polite, jamais assertive", async ({ page }) => {
    await login(page, "PDG");
    // Régions de l'application elle-même (la pastille de développement de Next, dans son shadow DOM, est hors sujet)
    const regions = await page.evaluate(() => [...document.querySelectorAll("[aria-live]")].map((el) => el.getAttribute("aria-live")));
    expect(regions.filter((r) => r === "polite")).toHaveLength(1);
    expect(regions).not.toContain("assertive");

    // Un toast apparaît dans la région polite (épingler puis désépingler : état inchangé)
    await ouvrirProjet(page);
    const epingle = page.getByTestId("bien-carte").first().getByTestId("bien-epingle");
    const avant = await epingle.getAttribute("aria-pressed");
    await epingle.click();
    const toast = page.locator('[aria-live="polite"] [role="status"]').first();
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/épinglé/i);
    await epingle.click();
    await expect(epingle).toHaveAttribute("aria-pressed", avant ?? "false");
  });

  test("actions rapides des cartes : visibles au focus clavier, pas seulement au survol", async ({ page }) => {
    await login(page, "PDG");
    await ouvrirProjet(page);
    const carte = carteBloquable(page);
    const action = carte.getByRole("button", { name: "Bloquer ce bien" });
    const conteneur = action.locator("xpath=.."); // la barre d'actions rapides
    // Au repos (sans souris dessus) : masquée
    await page.mouse.move(0, 0);
    await expect(conteneur).toHaveCSS("opacity", "0");
    // Tab depuis le bouton d'épinglage atteint l'action, qui devient visible
    await carte.getByTestId("bien-epingle").focus();
    await page.keyboard.press("Tab");
    await expect(action).toBeFocused();
    await expect(conteneur).toHaveCSS("opacity", "1");
    await expect(action).toBeVisible();
  });

  test("chaque champ de formulaire a un nom accessible (login, admin, client)", async ({ page }) => {
    const sansNom = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("input:not([type=hidden]), select, textarea")]
          .filter((el) => el.offsetParent !== null)
          .filter((el) => {
            const id = el.id;
            const parLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
            return !parLabel && !el.closest("label") && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
          })
          .map((el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute("name")}]`),
      );
    await page.context().clearCookies();
    await page.goto("/login");
    expect(await sansNom()).toEqual([]);
    await login(page, "SUPERADMIN");
    await page.goto("/admin/nouveau");
    expect(await sansNom()).toEqual([]);
    await login(page, "CLIENT");
    await page.goto("/client/rendez-vous");
    expect(await sansNom()).toEqual([]);
  });
});

test.describe("Accessibilité — mouvement réduit", () => {
  test("prefers-reduced-motion neutralise les animations CSS et motion (sidebar, modale, badges)", async ({ browser }) => {
    const contexte = await browser.newContext({ reducedMotion: "reduce" });
    const page = await contexte.newPage();
    try {
      await login(page, "PDG");
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

      // Transitions CSS (tokens de l'étape 1) : durée quasi nulle
      const lien = page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link").first();
      const duree = await lien.evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(parseFloat(duree)).toBeLessThanOrEqual(0.01);

      await ouvrirProjet(page);

      // Animations motion/react : la modale atteint sa position finale quasi instantanément
      // (sans réduction, le ressort scale 0.96 → 1 / y 12 → 0 dure plusieurs centaines de ms)
      await observerModale(page);
      await carteBloquable(page).getByRole("button", { name: "Bloquer ce bien" }).click();
      const dialog = page.getByRole("dialog", { name: /Bloquer/ });
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(600);
      // Sans interpolation : au plus l'état initial puis l'état final (2 valeurs), en quelques images
      const { delai, etapes } = await trajetModale(page);
      expect(etapes, "valeurs de transformation traversées (mouvement réduit)").toBeLessThanOrEqual(2);
      // Le délai inclut le rendu React de la modale (variable selon la charge de la machine) : la
      // discrimination porte sur le nombre d'étapes ci-dessus ; la borne reste un garde-fou large.
      expect(delai, "délai (ms) avant la position finale de la modale (mouvement réduit)").toBeLessThan(400);
      await page.keyboard.press("Escape");

      // Bascule grille → liste : les cartes ne doivent pas passer par un état transformé
      await page.getByTestId("vue-liste").click();
      await expect(page.getByTestId("bien-ligne").first()).toBeVisible();
      const ligne = page.getByTestId("bien-ligne").first().locator("xpath=..");
      expect(await ligne.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    } finally {
      await contexte.close();
    }
  });

  test("sans préférence, la modale s'anime bien (contrôle du test précédent)", async ({ browser }) => {
    const contexte = await browser.newContext({ reducedMotion: "no-preference" });
    const page = await contexte.newPage();
    try {
      await login(page, "PDG");
      await ouvrirProjet(page);
      await observerModale(page);
      await carteBloquable(page).getByRole("button", { name: "Bloquer ce bien" }).click();
      await expect(page.getByRole("dialog", { name: /Bloquer/ })).toBeVisible();
      await page.waitForTimeout(600);
      // Ressort interpolé : de nombreuses valeurs intermédiaires sur plusieurs centaines de ms
      const { delai, etapes } = await trajetModale(page);
      expect(etapes, "valeurs de transformation traversées (animation normale)").toBeGreaterThanOrEqual(5);
      expect(delai, "délai (ms) avant la position finale de la modale (animation normale)").toBeGreaterThan(150);
      await page.keyboard.press("Escape");
    } finally {
      await contexte.close();
    }
  });
});
