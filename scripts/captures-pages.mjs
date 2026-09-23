// Captures d'écran de pages pour la revue du design system.
// Usage : node scripts/captures-pages.mjs <phase> <ROLE:/chemin:nom> [...]
// Ex. : node scripts/captures-pages.mjs p1 SUPERADMIN:/admin:admin PDG:/dashboard:dashboard
// Lance son propre serveur `next dev` (port 3200, SQLite data/promopro.db), puis l'arrête.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [phase, ...cibles] = process.argv.slice(2);
if (!phase || cibles.length === 0) {
  console.error("Usage : node scripts/captures-pages.mjs <phase> <ROLE:/chemin:nom> [...]");
  process.exit(2);
}
const PORT = 3200;
const base = `http://localhost:${PORT}`;
const dossier = `docs/captures/${phase}`;
mkdirSync(dossier, { recursive: true });

const MDP = { SUPERADMIN: "admin1234" };
const ID = {
  SUPERADMIN: "SUPERADMIN", PDG: "PDG-DEMO", DIRCOM: "DIRCOM-DEMO", COM1: "COM1-DEMO", COM2: "COM2-DEMO",
  RESPADM: "RESPADM-DEMO", DIRFIN: "DIRFIN-DEMO", COMPTA: "COMPTA-DEMO", ASSIST: "ASSIST-DEMO", SAV: "SAV-DEMO",
  RECOUV: "RECOUV-DEMO", CLIENT: "CL-DEMO", AUCUN: null,
};

const serveur = spawn("npx next dev --port " + PORT, {
  shell: true,
  env: { ...process.env, DATABASE_URL: "", ALLOW_REMOTE_DB_IN_DEV: "", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "ignore",
});
const debut = Date.now();
while (Date.now() - debut < 120_000) {
  try {
    const r = await fetch(`${base}/api/health`);
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } });
let roleCourant = "";
// Erreurs console / exceptions de la page : affichées sous chaque capture (la pastille « Issue » de Next les signale sinon en silence)
const erreurs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erreurs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => erreurs.push(`[pageerror] ${e.message}`));

try {
  for (const cible of cibles) {
    const [role, chemin, nom] = cible.split(":");
    if (role !== roleCourant) {
      await page.context().clearCookies();
      if (ID[role]) {
        await page.goto(`${base}/login`);
        await page.getByLabel("Identifiant").fill(ID[role]);
        await page.getByLabel("Mot de passe").fill(MDP[role] ?? "demo1234");
        await page.getByRole("button", { name: "Se connecter" }).click();
        await page.waitForURL((u) => !u.pathname.endsWith("/login"));
      }
      roleCourant = role;
    }
    await page.goto(`${base}${chemin}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dossier}/${nom}.png`, fullPage: true });
    console.log(`✓ ${dossier}/${nom}.png`);
    for (const e of erreurs.splice(0)) console.log(`  ⚠ ${e.slice(0, 600)}`);
  }
} finally {
  await navigateur.close();
  await arreterServeur();
}

// Arrêt du serveur : l'arbre de processus (cmd → npx → node) ne se laisse pas
// toujours tuer d'un bloc sous Windows ; on vérifie que le port est libéré et,
// sinon, on tue le processus qui l'écoute encore (sans quoi `next dev` garde
// le verrou du dossier et bloque `npm run test:e2e`).
async function arreterServeur() {
  await execute(`taskkill /F /T /PID ${serveur.pid}`);
  serveur.kill();
  for (let i = 0; i < 10; i++) {
    if (!(await enVie())) return;
    const sortie = await execute(`netstat -ano -p tcp | findstr :${PORT} | findstr LISTENING`);
    const pids = new Set(sortie.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((p) => /^\d+$/.test(p ?? "")));
    for (const pid of pids) await execute(`taskkill /F /T /PID ${pid}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function enVie() {
  try {
    const r = await fetch(`${base}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

function execute(commande) {
  return new Promise((resolve) => {
    const p = spawn(commande, { shell: true, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(out));
    p.on("error", () => resolve(out));
  });
}
