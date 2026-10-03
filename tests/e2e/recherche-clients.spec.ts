import { expect, test, type Page } from "@playwright/test";
import { login, SUFFIXE_RUN } from "./helpers";

/*
 * Recherche de clients inter-commerciaux (détection de doublons) : un
 * commercial trouve un client déjà enregistré par un collègue du même
 * promoteur, mais n'en voit que l'identité (nom, prénom, date de naissance,
 * pièce) et le nom du collègue — jamais le téléphone, l'e-mail, l'identifiant
 * ni un lien vers le dossier. Ses propres clients apparaissent avec les
 * informations habituelles et le lien vers la fiche. Les autres rôles sont
 * redirigés. L'isolation entre promoteurs est vérifiée dans isolation.spec.ts.
 */
test.describe.configure({ mode: "serial" });

const S = SUFFIXE_RUN;
const DOUBLON = { nom: `Doublon${S}`, prenom: "Nadia", date: "1990-05-05", cin: `AB${S}77` };
const TEL = { com1: "06 10 00 00 01", com2: "06 20 00 00 02" };
const MAIL = { com1: `nadia1.${S.toLowerCase()}@exemple.ma`, com2: `nadia2.${S.toLowerCase()}@exemple.ma` };

async function creerClient(page: Page, qui: "COM1" | "COM2") {
  await login(page, qui);
  await page.goto("/dashboard/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(DOUBLON.nom);
  await page.getByLabel("Prénom").fill(DOUBLON.prenom);
  await page.getByLabel("Date de naissance").fill(DOUBLON.date);
  await page.getByLabel("Numéro de pièce").fill(qui === "COM1" ? DOUBLON.cin : `ab ${S}-77`);
  await page.getByLabel("Téléphone 1").fill(qui === "COM1" ? TEL.com1 : TEL.com2);
  await page.getByLabel("E-mail").fill(qui === "COM1" ? MAIL.com1 : MAIL.com2);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByTestId("bloc-acces").first()).toBeVisible();
}

async function rechercher(page: Page, params: Record<string, string>) {
  await page.goto(`/dashboard/recherche-clients?${new URLSearchParams(params)}`);
  await expect(page.getByTestId("form-recherche-clients")).toBeVisible();
}

test("mise en place : deux commerciaux du même promoteur enregistrent chacun la même personne", async ({ page }) => {
  await creerClient(page, "COM1");
  await creerClient(page, "COM2");
});

test("un commercial trouve le client de son collègue par CIN, nom ou date de naissance, sans ses informations privées ni lien ; le sien avec tout", async ({ page }) => {
  await login(page, "COM2");
  // Accès par le menu
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Recherche clients" }).click();
  await expect(page).toHaveURL(/\/dashboard\/recherche-clients$/);
  await page.locator("#rc-piece").fill(`ab${S}77`);
  await page.getByTestId("lancer-recherche").click();
  await expect(page).toHaveURL(/piece=/);

  const miens = page.getByTestId("section-mes-clients");
  const autres = page.getByTestId("section-autres-clients");
  await expect(miens.getByTestId("resultat-client")).toHaveCount(1);
  await expect(autres.getByTestId("resultat-client")).toHaveCount(1);

  // Mon client : lien vers le dossier, contact visible
  const mien = miens.getByTestId("resultat-client");
  await expect(mien.getByTestId("resultat-identite")).toHaveAttribute("data-detail", "complet");
  await expect(mien.getByTestId("resultat-lien")).toHaveAttribute("href", /\/dashboard\/clients\/[0-9a-f-]{36}$/);
  await expect(mien.getByTestId("resultat-contact")).toContainText(TEL.com2);
  await expect(mien).toContainText("Imane Tazi");

  // Le client du collègue : identité, pièce et nom du collègue seulement
  const autre = autres.getByTestId("resultat-client");
  await expect(autre.getByTestId("resultat-identite")).toHaveAttribute("data-detail", "limite");
  await expect(autre).toContainText(`${DOUBLON.prenom} ${DOUBLON.nom}`);
  await expect(autre).toContainText(`CIN ${DOUBLON.cin}`);
  await expect(autre).toContainText("Youssef Idrissi");
  await expect(autre.getByTestId("resultat-reserve")).toBeVisible();
  await expect(autre.getByTestId("resultat-lien")).toHaveCount(0);
  await expect(autre.locator("a")).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain(TEL.com1);
  expect(html).not.toContain(MAIL.com1);

  // Par nom (accents et casse ignorés) et par date de naissance : mêmes deux résultats
  await rechercher(page, { nom: `doublon${S.toLowerCase()}` });
  await expect(page.getByTestId("resultat-client")).toHaveCount(2);
  await rechercher(page, { dateNaissance: DOUBLON.date, prenom: "NADIA" });
  await expect(page.getByTestId("resultat-client")).toHaveCount(2);
  // Un critère qui ne correspond pas : état vide explicite
  await rechercher(page, { nom: DOUBLON.nom, piece: "ZZ000000" });
  await expect(page.getByTestId("recherche-clients-vide")).toBeVisible();
  // Sans critère exploitable : deux lettres ne suffisent pas (ni pour un nom, ni pour une pièce), trois oui
  await rechercher(page, { nom: "D" });
  await expect(page.getByTestId("recherche-criteres-invalides")).toBeVisible();
  await rechercher(page, { nom: "Do" });
  await expect(page.getByTestId("recherche-criteres-invalides")).toBeVisible();
  await expect(page.getByTestId("resultat-client")).toHaveCount(0);
  await rechercher(page, { piece: `AB${S}`.slice(0, 4) });
  await expect(page.getByTestId("recherche-criteres-invalides")).toBeVisible();
  await rechercher(page, { nom: `Doublon${S}`.slice(0, 9) });
  await expect(page.getByTestId("resultat-client")).toHaveCount(2);
});

test("le premier commercial voit la situation inverse ; le dossier du client du collègue reste introuvable même avec son identifiant", async ({ page }) => {
  await login(page, "COM1");
  await rechercher(page, { nom: DOUBLON.nom });
  const miens = page.getByTestId("section-mes-clients").getByTestId("resultat-client");
  const autres = page.getByTestId("section-autres-clients").getByTestId("resultat-client");
  await expect(miens).toHaveCount(1);
  await expect(autres).toHaveCount(1);
  await expect(miens.getByTestId("resultat-contact")).toContainText(TEL.com1);
  await expect(autres).toContainText("Imane Tazi");
  await expect(autres.getByTestId("resultat-lien")).toHaveCount(0);
  // Le client du collègue est désigné par son id dans la ligne (clé de tri), mais sa fiche répond « introuvable »
  const idAutre = await autres.evaluate((el) => (el as HTMLElement).dataset.key ?? "");
  if (idAutre) {
    await page.goto(`/dashboard/clients/${idAutre}`);
    await expect(page.getByTestId("page-introuvable")).toBeVisible();
  }
});

test("les autres rôles n'ont ni le menu ni la page", async ({ page }) => {
  for (const compte of ["PDG", "COMPTA", "DIRCOM"] as const) {
    await login(page, compte);
    await expect(page.getByRole("link", { name: "Recherche clients" })).toHaveCount(0);
    await page.goto("/dashboard/recherche-clients?nom=Naciri");
    await expect(page).toHaveURL(/erreur=acces-refuse/);
  }
});
