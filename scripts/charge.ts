/*
 * Test de charge basique (lecture seule) : ~20 utilisateurs simultanés qui
 * naviguent sur /dashboard/projets, /dashboard/propositions et /client contre
 * un serveur de PRODUCTION LOCAL (next start), pendant quelques minutes.
 *
 *   npm run build
 *   npm run test:e2e:setup                      # base SQLite jetable data/test.db
 *   DATABASE_URL="" SQLITE_PATH=data/test.db JWT_SECRET=<secret> npx next start --port 3102
 *   SQLITE_PATH=data/test.db JWT_SECRET=<même secret> npm run charge -- --url http://localhost:3102 --duree 120 --connexions 20
 *
 * Les sessions sont forgées localement avec le même JWT_SECRET que le serveur
 * (un compte staff PDG et un compte client de la base), jamais contre Railway :
 * le script refuse toute URL non locale. Résultats : latences p50 / p97,5 /
 * p99, requêtes par seconde, taux d'erreur (non-2xx / 3xx). Voir PERFORMANCE.md.
 */
import autocannon from "autocannon";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, closeDb } from "@/db/client";
import { users, clients } from "@/db/schema";
import { signSession, SESSION_COOKIE } from "@/lib/auth";

function option(nom: string, defaut: string) {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

const url = option("url", "http://localhost:3102").replace(/\/$/, "");
const duree = Number(option("duree", "120"));
const connexions = Number(option("connexions", "20"));
const sortieJson = option("json", "");

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  console.error(`Refus : ${url} n'est pas un serveur local. Ce test de charge ne vise jamais la production.`);
  process.exit(1);
}

async function main() {
  const pdg = await db.query.users.findFirst({ where: eq(users.role, "PDG") });
  const client = await db.query.clients.findFirst({ where: eq(clients.identifiant, "CL-DEMO") });
  if (!pdg || !client) {
    console.error("Base sans compte PDG ou client CL-DEMO : lancez npm run test:e2e:setup (ou db:seed) sur la base visée.");
    process.exit(1);
  }
  const cookieStaff = `${SESSION_COOKIE}=${await signSession({ kind: "staff", userId: pdg.id, role: pdg.role, promoteurId: pdg.promoteurId, nom: pdg.nom, prenom: pdg.prenom })}`;
  const cookieClient = `${SESSION_COOKIE}=${await signSession({ kind: "client", clientId: client.id, promoteurId: client.promoteurId, nom: client.nom, prenom: client.prenom })}`;
  await closeDb();

  // Vérification préalable : les trois pages répondent 200 avec ces sessions (sinon le secret ou la base ne correspondent pas)
  for (const [path, cookie] of [
    ["/dashboard/projets", cookieStaff],
    ["/dashboard/propositions", cookieStaff],
    ["/client", cookieClient],
  ] as const) {
    const r = await fetch(url + path, { headers: { cookie }, redirect: "manual" });
    if (r.status !== 200) {
      console.error(`Pré-vérification : ${path} → ${r.status} (attendu 200). JWT_SECRET identique au serveur ? Base identique ?`);
      process.exit(1);
    }
  }

  console.log(`→ ${connexions} connexions simultanées pendant ${duree}s sur ${url} (projets, propositions, espace client)…`);
  const debut = new Date();
  const resultat = await autocannon({
    url,
    connections: connexions,
    duration: duree,
    requests: [
      { method: "GET", path: "/dashboard/projets", headers: { cookie: cookieStaff } },
      { method: "GET", path: "/dashboard/propositions", headers: { cookie: cookieStaff } },
      { method: "GET", path: "/client", headers: { cookie: cookieClient } },
    ],
  });

  const total = resultat.requests.total;
  const erreurs = resultat.non2xx + resultat.errors + resultat.timeouts;
  const resume = {
    date: debut.toISOString(),
    url,
    connexions,
    dureeSecondes: duree,
    requetes: total,
    requetesParSeconde: { moyenne: resultat.requests.average, p50: resultat.requests.p50 },
    latenceMs: { moyenne: resultat.latency.average, p50: resultat.latency.p50, p97_5: resultat.latency.p97_5, p99: resultat.latency.p99, max: resultat.latency.max },
    erreurs: { non2xx: resultat.non2xx, erreursReseau: resultat.errors, timeouts: resultat.timeouts, taux: total ? erreurs / total : 0 },
    codes: resultat.statusCodeStats,
  };
  console.log("\n=== Résultats ===");
  console.log(`Requêtes : ${total} (${resume.requetesParSeconde.moyenne.toFixed(1)} req/s en moyenne)`);
  console.log(`Latence  : p50 ${resume.latenceMs.p50} ms · p97,5 ${resume.latenceMs.p97_5} ms · p99 ${resume.latenceMs.p99} ms · max ${resume.latenceMs.max} ms`);
  console.log(`Erreurs  : ${erreurs} (${(resume.erreurs.taux * 100).toFixed(2)} %) — non-2xx ${resultat.non2xx}, réseau ${resultat.errors}, timeouts ${resultat.timeouts}`);
  console.log(`Codes    : ${JSON.stringify(resultat.statusCodeStats)}`);
  if (sortieJson) {
    writeFileSync(sortieJson, JSON.stringify(resume, null, 2));
    console.log(`Résumé écrit dans ${sortieJson}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
