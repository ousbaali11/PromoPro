import { expect, type Page } from "@playwright/test";

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
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(c.identifiant);
  await page.getByLabel("Mot de passe").fill(c.mdp);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(c.atterrissage);
}
