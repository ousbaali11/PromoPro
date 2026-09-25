import { expect, type Locator, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";
import * as XLSX from "xlsx";

export const MDP = "demo1234";

/** Comptes créés par le seed (src/db/seed.ts) et page d'atterrissage attendue. */
export const COMPTES = {
  SUPERADMIN: { identifiant: "SUPERADMIN", mdp: "admin1234", atterrissage: /\/admin$/ },
  PDG: { identifiant: "PDG-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  DIRCOM: { identifiant: "DIRCOM-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  COM1: { identifiant: "COM1-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  COM2: { identifiant: "COM2-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  RESPADM: { identifiant: "RESPADM-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  DIRFIN: { identifiant: "DIRFIN-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  COMPTA: { identifiant: "COMPTA-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  ASSIST: { identifiant: "ASSIST-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  SAV: { identifiant: "SAV-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  RECOUV: { identifiant: "RECOUV-DEMO", mdp: MDP, atterrissage: /\/dashboard$/ },
  CLIENT: { identifiant: "CL-DEMO", mdp: MDP, atterrissage: /\/client(\/biens\/[^/]+)?$/ },
} as const;

/** Repart d'une session vierge, se connecte et attend l'atterrissage. */
export async function login(page: Page, compte: keyof typeof COMPTES) {
  const c = COMPTES[compte];
  await loginAvec(page, c.identifiant, c.mdp, c.atterrissage);
}

/** Connexion avec des identifiants arbitraires (comptes créés pendant le test). */
export async function loginAvec(page: Page, identifiant: string, mdp: string, atterrissage: RegExp = /\/(dashboard|admin|client(\/biens\/[^/]+)?)$/) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill(mdp);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(atterrissage);
}

/**
 * Bouton de confirmation à deux temps (ConfirmButton) : premier clic arme, second
 * confirme. Sur un runner lent (CI), le premier clic peut tomber avant
 * l'hydratation du composant et se perdre : on clique jusqu'à constater
 * l'armement (`data-armed`), puis on confirme. Ne jamais cliquer deux fois de
 * suite sans cette vérification.
 */
export async function confirmer(page: Page, testId: string, dans?: Locator) {
  const bouton = (dans ?? page).getByTestId(testId);
  await expect(async () => {
    await bouton.click();
    await expect(bouton).toHaveAttribute("data-armed", "true", { timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  await bouton.click();
}

/**
 * Forge l'argument d'une Server Action : remplace `ancien` par `nouveau` dans le
 * corps de la prochaine requête d'action (en-tête Next-Action), comme le ferait
 * un client HTTP modifié. Renvoie une fonction qui retire l'interception.
 */
export async function forgerArgumentAction(page: Page, ancien: string, nouveau: string) {
  const handler = async (route: import("@playwright/test").Route) => {
    const req = route.request();
    const corps = req.postData();
    if (req.method() === "POST" && req.headers()["next-action"] && corps && corps.includes(ancien)) {
      await route.continue({ postData: corps.split(ancien).join(nouveau) });
    } else {
      await route.continue();
    }
  };
  await page.route("**/*", handler);
  return () => page.unroute("**/*", handler);
}

/** PDF minimal valide (en-tête %PDF), pour les pièces jointes .pdf. */
export const PDF_MIN = Buffer.from(
  ["%PDF-1.4", "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj", "2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj", "trailer<</Root 1 0 R>>", "%%EOF", ""].join("\n"),
  "latin1",
);

/** Type MIME et contenu par défaut selon l'extension (le serveur vérifie la signature du contenu). */
export function fichierDeTest(name: string, buffer?: Buffer) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return { name, mimeType: "application/pdf", buffer: buffer ?? PDF_MIN };
  if (ext === "glb") return { name, mimeType: "model/gltf-binary", buffer: buffer ?? Buffer.alloc(0) };
  if (ext === "jpg" || ext === "jpeg") return { name, mimeType: "image/jpeg", buffer: buffer ?? PNG_1x1 };
  return { name, mimeType: "image/png", buffer: buffer ?? PNG_1x1 };
}

/** PNG 1×1 valide, utilisé comme pièce jointe (preuve, document, photo). */
export const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Dépose un fichier dans le premier `<input type="file">` du conteneur (composant
 * FileUpload) et attend que le chemin `/api/files/...` soit inscrit dans l'input caché.
 */
export async function deposerFichier(
  conteneur: ReturnType<Page["locator"]>,
  nomChampCache: string,
  fichiers: { name: string; buffer?: Buffer }[] = [{ name: "piece.png" }],
) {
  const input = conteneur.locator('input[type="file"]').first();
  await input.setInputFiles(fichiers.map((f) => fichierDeTest(f.name, f.buffer)));
  const caches = conteneur.locator(`input[type="hidden"][name="${nomChampCache}"]`);
  await expect
    .poll(async () => (await caches.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).filter((v) => v.startsWith("/api/files/")).length)
    .toBe(fichiers.length);
}

/** Depuis l'espace client, ouvre la page du bien dont la désignation est donnée (1 ou plusieurs biens). */
export async function ouvrirBienClient(page: Page, designation: string) {
  await page.goto("/client");
  // Un seul bien → redirection automatique vers sa page ; plusieurs → liste à cliquer.
  // On attend le premier des deux (sans délai fixe : la redirection peut être lente à froid).
  const pageBien = /\/client\/biens\/[^/]+$/;
  const lien = page.getByRole("link", { name: new RegExp(designation) }).first();
  await Promise.race([page.waitForURL(pageBien), lien.waitFor()]);
  if (!pageBien.test(page.url())) {
    await lien.click();
    await expect(page).toHaveURL(pageBien);
  }
  // Attendre le rendu du titre de la page bien, puis vérifier qu'il s'agit du bon bien
  const h1 = page.locator("h1").first();
  await expect(h1).toBeVisible();
  if ((await h1.textContent())?.trim() !== designation) {
    // Redirigé vers un autre bien : passer par le sélecteur de biens
    await page.getByRole("link", { name: designation, exact: true }).first().click();
  }
  await expect(page.getByRole("heading", { name: designation })).toBeVisible();
}

/** Id (uuid) d'un bien depuis la page projet côté staff, par sa désignation. */
export async function hrefBienStaff(page: Page, designation: string) {
  await page.goto("/dashboard/projets");
  await page.getByRole("link", { name: /Résidence Al Manar/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/projets\/[^/]+$/);
  const href = await page.getByRole("link", { name: designation, exact: true }).getAttribute("href");
  expect(href).toMatch(/\/dashboard\/biens\//);
  return href!;
}

/** Ligne « Tranche N » de l'échéancier affiché au client (page bien). */
export function ligneTrancheClient(page: Page, numero: number) {
  return page.locator("div.bg-navy-50", { hasText: new RegExp(`^Tranche ${numero} ·`) });
}

/** Ligne « Tranche N » d'un tableau côté staff (fiche bien, recouvrement). */
export function ligneTrancheStaff(page: Page, numero: number) {
  return page.locator("table tbody tr", { hasText: new RegExp(`Tranche ${numero} ·`) });
}

/** Sélectionne « Tranche N » dans le formulaire de paiement (PaiementForm). */
export async function choisirTranche(form: ReturnType<Page["locator"]>, numero: number) {
  const select = form.locator('select[name="echeanceId"]');
  const value = await select.evaluate((el, n) => {
    const opt = [...(el as HTMLSelectElement).options].find((o) => o.textContent?.trim().startsWith(`Tranche ${n} `));
    return opt?.value ?? "";
  }, numero);
  expect(value, `Tranche ${numero} absente du formulaire`).not.toBe("");
  await select.selectOption(value);
}

/**
 * Texte brut d'un PDF généré par pdf-lib : les flux de contenu sont compressés
 * (FlateDecode) ; on les décompresse et on concatène. Suffisant pour vérifier
 * qu'une chaîne (référence, nom) figure dans le document.
 */
export function texteDuPdf(buffer: Buffer) {
  const morceaux: string[] = [];
  const src = buffer.toString("latin1");
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const brut = Buffer.from(m[1], "latin1");
    let flux: string;
    try {
      flux = inflateSync(brut).toString("latin1");
    } catch {
      flux = m[1];
    }
    // pdf-lib écrit les chaînes de texte en hexadécimal (<...> Tj), codes WinAnsi ≈ latin1
    morceaux.push(flux.replace(/<([0-9A-Fa-f]+)>/g, (_, hex: string) => Buffer.from(hex, "hex").toString("latin1")));
  }
  return morceaux.join("\n");
}

/** Date locale au format YYYY-MM-DD. */
export function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Prochaine occurrence (strictement future, au moins J+2) d'un jour de semaine (0 = dimanche, 1 = lundi…). */
export function prochainJour(jour: number, aPartirDe = new Date()) {
  const d = new Date(aPartirDe);
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== jour) d.setDate(d.getDate() + 1);
  return d;
}

/** Classeur Excel (.xlsx) généré en mémoire pour setInputFiles : une feuille, en-têtes = clés des objets. */
export function classeurXlsx(lignes: Record<string, string>[], name = "prospects.xlsx") {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), "Prospects");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer };
}
