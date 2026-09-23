import { expect, test, type Page } from "@playwright/test";
import { login, loginAvec, confirmer, forgerArgumentAction, deposerFichier, ouvrirBienClient, classeurXlsx, PNG_1x1 } from "./helpers";

/*
 * Isolation multi-promoteur : un second promoteur « B » est créé par le Super
 * Admin avec ses directions, un commercial, un client, un projet, un bien
 * vendu, un plan et une demande de travaux modificatifs. Le staff du promoteur
 * de démonstration (« A ») tente ensuite d'atteindre ces enregistrements par
 * leurs identifiants : pages, fichiers, journal, actions forgées (identifiant
 * substitué dans un formulaire ou dans l'argument d'une Server Action, comme
 * le ferait un client HTTP modifié), route de restauration. Tableau
 * appelant × cible × réponse attendue : voir SECURITY.md.
 */
test.describe.configure({ mode: "serial" });

const SUFFIXE = Date.now().toString(36).toUpperCase();
const B = {
  nom: `Promoteur B ${SUFFIXE}`,
  projet: `Projet B ${SUFFIXE}`,
  bien: `Villa B1 ${SUFFIXE}`,
  clientNom: `Benali${SUFFIXE}`,
  pdg: { identifiant: "", mdp: "" },
  dircom: { identifiant: "", mdp: "" },
  com: { identifiant: "", mdp: "", id: "" },
  client: { identifiant: "", mdp: "", id: "" },
  projetId: "",
  bienId: "",
  bienHref: "",
  fichier: "",
  demandeId: "",
};
const A = { bienNom: `Isolation A ${SUFFIXE}`, bienHref: "", bienId: "", temoinTma: `Isolation A — demande témoin ${SUFFIXE}` };

async function lireAcces(bloc: ReturnType<Page["getByTestId"]>) {
  const dd = bloc.locator("dd");
  return { identifiant: (await dd.nth(0).innerText()).trim(), mdp: (await dd.nth(1).innerText()).trim() };
}

test("mise en place : promoteur B, directions, commercial, client, bien vendu, plan, demande TMA", async ({ page }) => {
  // Super Admin : promoteur B et ses trois directions
  await login(page, "SUPERADMIN");
  await page.goto("/admin/nouveau");
  await page.getByLabel("Nom du promoteur").fill(B.nom);
  for (const [champ, nom] of [
    ["pdg", "Pdg"],
    ["dircom", "Dircom"],
    ["dirfin", "Dirfin"],
  ] as const) {
    await page.locator(`#${champ}Nom`).fill(`${nom} B`);
    await page.locator(`#${champ}Prenom`).fill("Isolation");
  }
  await page.getByRole("button", { name: /Créer le promoteur/ }).click();
  const blocs = page.getByTestId("bloc-acces");
  await expect(blocs).toHaveCount(3);
  B.pdg = await lireAcces(blocs.filter({ hasText: "PDG" }));
  B.dircom = await lireAcces(blocs.filter({ hasText: "Directeur Commercial" }));
  await page.goto("/admin");
  const lignePromoteur = page.getByTestId("promoteur-ligne").filter({ hasText: B.nom });
  await lignePromoteur.getByRole("button", { name: "Activer" }).click();
  await expect(lignePromoteur.locator('[data-statut="ACTIF"]')).toBeVisible();

  // Directeur Commercial B : projet, bien, plan 2D, commercial, client
  await loginAvec(page, B.dircom.identifiant, B.dircom.mdp, /\/dashboard$/);
  await page.goto("/dashboard/projets/nouveau");
  await page.getByLabel("Nom du projet").fill(B.projet);
  await page.getByLabel(/Nom du compte/).fill("SCI B");
  await page.getByLabel(/IBAN/).fill("MA00 9999 8888 7777 6666 5555");
  await page.getByRole("button", { name: /Créer le projet/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/(?!nouveau)[^/]+$/); // redirection vers la fiche du projet créé
  B.projetId = page.url().split("/").pop()!;
  expect(B.projetId).toMatch(/^[0-9a-f-]{36}$/);
  const formBien = page.getByTestId("form-ajout-bien");
  await formBien.getByLabel("Désignation").fill(B.bien);
  await formBien.getByLabel(/Prix/).fill("1500000");
  await formBien.getByLabel(/Surface/).fill("180");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  const lienBien = page.getByRole("link", { name: B.bien });
  await expect(lienBien).toBeVisible();
  B.bienHref = (await lienBien.getAttribute("href"))!;
  await page.goto(B.bienHref);
  B.bienId = (await page.getByTestId("bien-id").getAttribute("data-id"))!;
  expect(B.bienId).toMatch(/^[0-9a-f-]{36}$/);
  await deposerFichier(page.getByTestId("form-plans"), "plan2dUrl", [{ name: "plan-b.png" }]);
  await page.getByRole("button", { name: "Enregistrer les plans" }).click();
  const img = page.locator('img[alt="Plan du bien"]');
  await expect(img).toHaveAttribute("src", /\/api\/files\/plans\//);
  B.fichier = (await img.getAttribute("src"))!;

  await page.goto("/dashboard/equipe");
  await page.getByLabel("Nom", { exact: true }).fill("Isolation");
  await page.getByLabel("Prénom").fill("Commercial");
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByText(/Compte .* créé/)).toBeVisible();
  const accesCom = await lireAcces(page.getByTestId("bloc-acces"));
  B.com = { ...accesCom, id: "" };
  await page.goto("/dashboard/equipe");
  const hrefModif = await page.getByTestId("membre-ligne").filter({ hasText: "Commercial Isolation" }).getByTestId("modifier-membre").getAttribute("href");
  B.com.id = hrefModif!.split("/")[3];
  expect(B.com.id).toMatch(/^[0-9a-f-]{36}$/);

  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(B.clientNom);
  await page.getByLabel("Prénom").fill("Zineb");
  await page.getByLabel("Téléphone 1").fill("06 77 00 00 01");
  await page.getByLabel("E-mail").fill(`zineb.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  const accesClient = await lireAcces(page.getByTestId("bloc-acces"));
  await page.goto("/dashboard/clients");
  const hrefClient = await page.getByRole("link", { name: new RegExp(B.clientNom) }).first().getAttribute("href");
  B.client = { ...accesClient, id: hrefClient!.split("/").pop()! };
  expect(B.client.id).toMatch(/^[0-9a-f-]{36}$/);

  // Commercial B : proposition pour ce client ; PDG B : acceptation → bien vendu
  await loginAvec(page, B.com.identifiant, B.com.mdp, /\/dashboard$/);
  await page.goto(B.bienHref);
  await page.getByRole("link", { name: "Envoyer une proposition" }).click();
  await page.locator('form[data-hydrated="true"]').first().waitFor();
  await page.locator('select[name="clientId"]').evaluate((el, nom) => {
    const sel = el as HTMLSelectElement;
    const opt = [...sel.options].find((o) => o.textContent?.includes(nom));
    if (!opt) throw new Error("Client B introuvable dans la liste");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, B.clientNom);
  await page.getByRole("button", { name: "Envoyer la proposition au PDG" }).click();
  await expect(page).toHaveURL(/\/dashboard\/propositions$/);
  await loginAvec(page, B.pdg.identifiant, B.pdg.mdp, /\/dashboard$/);
  await page.goto("/dashboard/propositions");
  const carte = page.locator("[data-card]", { hasText: B.bien });
  await carte.getByRole("button", { name: "Accepter" }).click();
  await expect(carte.getByText("Acceptée")).toBeVisible();

  // Client B : demande de travaux modificatifs
  await loginAvec(page, B.client.identifiant, B.client.mdp, /\/client(\/biens\/[^/]+)?$/);
  await ouvrirBienClient(page, B.bien);
  const section = page.getByTestId("section-tma");
  await section.getByRole("button", { name: "Demander une modification" }).click();
  await section.getByLabel("Modification souhaitée").fill(`Demande du promoteur B ${SUFFIXE}`);
  await section.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(section.getByTestId("tma-succes")).toBeVisible();
  B.demandeId = (await section.getByTestId("demande-tma").first().getAttribute("data-id"))!;
  expect(B.demandeId).toMatch(/^[0-9a-f-]{36}$/);
});

test("pages, fichiers et journal : les identifiants de B répondent 404 / 403 au staff de A, et n'apparaissent pas dans son journal", async ({ page }) => {
  await login(page, "DIRCOM");
  for (const url of [`/dashboard/biens/${B.bienId}`, `/dashboard/biens/${B.bienId}/modifier`, `/dashboard/projets/${B.projetId}`, `/dashboard/projets/${B.projetId}/modifier`]) {
    await page.goto(url);
    await expect(page.getByTestId("page-introuvable"), url).toBeVisible();
  }
  expect((await page.request.get(B.fichier)).status()).toBe(403);

  await login(page, "COM1");
  for (const url of [`/dashboard/clients/${B.client.id}`, `/dashboard/clients/${B.client.id}/modifier`]) {
    await page.goto(url);
    await expect(page.getByTestId("page-introuvable"), url).toBeVisible();
  }

  // Le même fichier est servi à B (avec nosniff), refusé sans session
  await loginAvec(page, B.dircom.identifiant, B.dircom.mdp, /\/dashboard$/);
  const ok = await page.request.get(B.fichier);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/png");
  expect(ok.headers()["x-content-type-options"]).toBe("nosniff");
  await page.context().clearCookies();
  expect((await page.request.get(B.fichier)).status()).toBe(401);

  // Journal : rien de B chez le PDG de A ; tout chez le Super Admin
  await login(page, "PDG");
  await page.goto("/dashboard/journal?periode=jour");
  await expect(page.getByRole("heading", { name: /Journal/ }).first()).toBeVisible();
  await expect(page.getByTestId("journal-ligne").filter({ hasText: B.projet })).toHaveCount(0);
  await expect(page.getByTestId("journal-ligne").filter({ hasText: B.nom })).toHaveCount(0);
  await login(page, "SUPERADMIN");
  await page.goto("/admin/journal?periode=jour");
  await expect(page.getByTestId("journal-ligne").filter({ hasText: B.projet })).toHaveCount(1);
  await expect(page.getByTestId("journal-ligne").filter({ hasText: B.nom }).first()).toBeVisible();
});

test("actions forgées : blocage, épingle, relance, réinitialisation de mot de passe, restauration, chiffrage TMA", async ({ page }) => {
  // Bien témoin côté A (disponible) pour disposer des formulaires à forger
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const formBien = page.getByTestId("form-ajout-bien");
  await formBien.getByLabel("Désignation").fill(A.bienNom);
  await formBien.getByLabel(/Prix/).fill("400000");
  await formBien.getByLabel(/Surface/).fill("50");
  await page.getByRole("button", { name: "Ajouter le bien" }).click();
  A.bienHref = (await page.getByRole("link", { name: A.bienNom }).getAttribute("href"))!;
  A.bienId = A.bienHref.split("/").pop()!;

  // 1) PDG de A × bien de B (bienId substitué dans le formulaire de blocage) → « Bien introuvable. »
  await login(page, "PDG");
  await page.goto(A.bienHref);
  await page.getByLabel(/Commentaire/).fill("Forgé E2E");
  await page.locator('input[name="bienId"]').evaluate((el, id) => ((el as HTMLInputElement).value = id), B.bienId);
  await page.getByRole("button", { name: "Bloquer ce bien" }).click();
  await expect(page.getByText("Bien introuvable.")).toBeVisible();

  // 2) Directeur Commercial de A × bien de B (argument de toggleEpingle substitué) → erreur, rien d'épinglé
  await login(page, "DIRCOM");
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  const carteA = page.getByTestId("bien-carte").filter({ hasText: A.bienNom });
  const retirerEpingle = await forgerArgumentAction(page, A.bienId, B.bienId);
  await carteA.getByTestId("bien-epingle").click();
  await page.waitForTimeout(500);
  await retirerEpingle();
  await page.goto("/dashboard");
  await expect(page.getByText(B.bien)).toHaveCount(0);
  await expect(page.getByText(A.bienNom)).toHaveCount(0); // la substitution a bien eu lieu : le bien de A n'est pas épinglé non plus

  // 3) Assistant de A × commercial de B (argument de relancerCommercial substitué) → aucune notification chez B
  await login(page, "ASSIST");
  await page.goto("/dashboard/prospects");
  const carteYoussef = page.getByTestId("commercial-carte").filter({ hasText: "Youssef Idrissi" });
  const idYoussef = (await carteYoussef.getAttribute("data-commercial-id"))!;
  const retirerRelance = await forgerArgumentAction(page, idYoussef, B.com.id);
  await carteYoussef.getByRole("button", { name: "Relancer" }).click();
  await expect(carteYoussef.getByRole("button", { name: "Relancé" })).toBeVisible();
  await retirerRelance();
  await loginAvec(page, B.com.identifiant, B.com.mdp, /\/dashboard$/);
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Relance — prospects en attente")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await login(page, "COM1"); // la substitution a bien eu lieu : Youssef n'a pas été relancé non plus
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Relance — prospects en attente")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // 4) Commercial 2 de A × client de B, puis × client d'un autre commercial de A (argument substitué) → mots de passe intacts
  await login(page, "COM1");
  await page.goto("/dashboard/clients");
  const hrefHamid = await page.getByRole("link", { name: /Naciri/ }).first().getAttribute("href");
  const idHamid = hrefHamid!.split("/").pop()!;
  await login(page, "COM2");
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(`Forge${SUFFIXE}`);
  await page.getByLabel("Prénom").fill("Test");
  await page.getByLabel("Téléphone 1").fill("06 77 00 00 02");
  await page.getByLabel("E-mail").fill(`forge.${SUFFIXE.toLowerCase()}@exemple.ma`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByTestId("bloc-acces")).toBeVisible();
  await page.goto("/dashboard/clients");
  const ligneForge = page.getByTestId("client-ligne").filter({ hasText: `Forge${SUFFIXE}` });
  const idForge = (await ligneForge.getByRole("link", { name: new RegExp(`Forge${SUFFIXE}`) }).getAttribute("href"))!.split("/").pop()!;
  // témoin : sur son propre client, la réinitialisation fonctionne
  await ligneForge.getByRole("button", { name: "Réinitialiser" }).click();
  await ligneForge.getByRole("button", { name: /Confirmer/ }).click();
  await expect(ligneForge.getByTestId("mot-de-passe-reinitialise")).toBeVisible();
  for (const cible of [B.client.id, idHamid]) {
    await page.goto("/dashboard/clients");
    const ligne = page.getByTestId("client-ligne").filter({ hasText: `Forge${SUFFIXE}` });
    const retirer = await forgerArgumentAction(page, idForge, cible);
    await ligne.getByRole("button", { name: "Réinitialiser" }).click();
    await ligne.getByRole("button", { name: /Confirmer/ }).click();
    await page.waitForTimeout(500);
    await retirer();
    await expect(ligne.getByTestId("mot-de-passe-reinitialise")).toHaveCount(0);
  }
  await loginAvec(page, B.client.identifiant, B.client.mdp, /\/client(\/biens\/[^/]+)?$/); // mot de passe de B intact
  await login(page, "CLIENT"); // celui d'Hamid aussi

  // 5) Directeur Commercial de A × comptes de B via POST /api/comptes/restaurer → 403
  await login(page, "DIRCOM");
  for (const data of [
    { type: "user", id: B.com.id },
    { type: "client", id: B.client.id },
  ]) {
    const res = await page.request.post("/api/comptes/restaurer", { data });
    expect(res.status(), JSON.stringify(data)).toBe(403);
  }

  // 6) SAV de A × demande TMA de B (demandeId substitué dans le formulaire de chiffrage) → « Demande introuvable. », statut de B inchangé
  await login(page, "CLIENT");
  await ouvrirBienClient(page, "Appartement A01");
  const sectionA = page.getByTestId("section-tma");
  await sectionA.getByRole("button", { name: "Demander une modification" }).click();
  await sectionA.getByLabel("Modification souhaitée").fill(A.temoinTma);
  await sectionA.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(sectionA.getByTestId("tma-succes")).toBeVisible();

  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  const carteTemoin = page.getByTestId("tma-carte").filter({ hasText: A.temoinTma });
  await carteTemoin.getByTestId("tma-chiffrer").click();
  const formChiffrage = carteTemoin.getByTestId("form-chiffrage");
  await formChiffrage.getByLabel("Montant du devis (MAD)").fill("9999");
  await deposerFichier(formChiffrage, "devisUrl", [{ name: "devis-forge.pdf" }]);
  await formChiffrage.locator('input[name="demandeId"]').evaluate((el, id) => ((el as HTMLInputElement).value = id), B.demandeId);
  await formChiffrage.getByRole("button", { name: "Envoyer le devis au client" }).click();
  await expect(carteTemoin.getByText("Demande introuvable.")).toBeVisible();
  await expect(carteTemoin).toHaveAttribute("data-statut-tma", "DEMANDE");
  await loginAvec(page, B.client.identifiant, B.client.mdp, /\/client(\/biens\/[^/]+)?$/);
  await ouvrirBienClient(page, B.bien);
  await expect(page.getByTestId("demande-tma").first()).toHaveAttribute("data-statut-tma", "DEMANDE");

  // Nettoyage : la demande témoin de A est refusée par le SAV
  await login(page, "SAV");
  await page.goto("/dashboard/sav");
  const carteTemoin2 = page.getByTestId("tma-carte").filter({ hasText: A.temoinTma });
  await carteTemoin2.getByRole("button", { name: "Refuser" }).click();
  await carteTemoin2.getByLabel("Motif du refus (transmis au client)").fill("Demande témoin du test d'isolation");
  await carteTemoin2.getByRole("button", { name: "Confirmer le refus" }).click();
  await expect(carteTemoin2).toHaveAttribute("data-statut-tma", "REFUSE");
});

test("import de prospects : la répartition ne propose que les commerciaux de A", async ({ page }) => {
  await login(page, "ASSIST");
  await page.goto("/dashboard/prospects");
  await page.getByTestId("bouton-import").click();
  await page.getByTestId("fichier-import").setInputFiles(classeurXlsx([{ nom: "Isolation Import", telephone: "06 88 00 00 01", source: "Avito" }], "isolation.xlsx"));
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByTestId("import-apercu")).toBeVisible();
  const commerciaux = page.getByTestId("apercu-commercial");
  expect(await commerciaux.count()).toBeGreaterThanOrEqual(2);
  await expect(commerciaux.filter({ hasText: "Commercial Isolation" })).toHaveCount(0);
  await expect(commerciaux.filter({ hasText: "Youssef Idrissi" })).toHaveCount(1);
});

test("compte suspendu : le cookie encore valide ne permet plus ni dépôt ni lecture de fichier (401), jusqu'à réactivation", async ({ page, browser }) => {
  const contexteClient = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const pageClient = await contexteClient.newPage();
  await loginAvec(pageClient, B.client.identifiant, B.client.mdp, /\/client(\/biens\/[^/]+)?$/);
  const deposer = () =>
    pageClient.request.post("/api/upload", { multipart: { type: "preuves-paiement", file: { name: "preuve.png", mimeType: "image/png", buffer: PNG_1x1 } } });
  expect((await deposer()).status()).toBe(200);
  expect((await pageClient.request.get(B.fichier)).status()).toBe(200);

  await loginAvec(page, B.dircom.identifiant, B.dircom.mdp, /\/dashboard$/);
  await page.goto(`/dashboard/clients/${B.client.id}`);
  await confirmer(page, "bouton-suspendre");
  await expect(page.getByTestId("etat-compte")).toHaveText("(suspendu)");

  expect((await deposer()).status()).toBe(401);
  expect((await pageClient.request.get(B.fichier)).status()).toBe(401);

  await page.getByRole("button", { name: "Réactiver" }).click();
  await expect(page.getByTestId("etat-compte")).toHaveCount(0);
  expect((await deposer()).status()).toBe(200);
  await contexteClient.close();
});

test("dépôt de fichiers : types réservés au staff, contenu incohérent refusé, limite de débit", async ({ page }) => {
  await login(page, "CLIENT");
  const client = (type: string, name: string, buffer: Buffer, mimeType = "image/png") =>
    page.request.post("/api/upload", { multipart: { type, file: { name, mimeType, buffer } } });
  expect((await client("contrats", "contrat.pdf", PNG_1x1)).status()).toBe(403);
  expect((await client("tma-devis", "devis.pdf", PNG_1x1)).status()).toBe(403);
  expect((await client("plans-3d", "cube.glb", PNG_1x1)).status()).toBe(403);
  const html = Buffer.from("<!doctype html><script>alert(1)</script>");
  const incoherent = await client("preuves-paiement", "preuve.png", html);
  expect(incoherent.status()).toBe(400);
  expect((await incoherent.json()).error).toContain("ne correspond pas");
  expect((await client("preuves-paiement", "preuve.png", PNG_1x1)).status()).toBe(200);
  expect((await client("preuves-paiement", "preuve.svg", PNG_1x1)).status()).toBe(400);

  // 30 dépôts par compte et par 10 minutes : le 31e répond 429 (compte sans autre dépôt dans la suite)
  await login(page, "DIRFIN");
  const staff = () => page.request.post("/api/upload", { multipart: { type: "recus", file: { name: "recu.png", mimeType: "image/png", buffer: PNG_1x1 } } });
  for (let i = 0; i < 30; i++) expect((await staff()).status(), `dépôt ${i + 1}`).toBe(200);
  const bloque = await staff();
  expect(bloque.status()).toBe(429);
  expect((await bloque.json()).error).toContain("Réessayez dans");
});
