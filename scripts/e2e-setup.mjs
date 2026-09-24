// Prépare la base SQLite jetable des tests de bout en bout (data/test.db) :
// suppression, création du schéma, jeu de données de démonstration.
// Ne touche JAMAIS à data/promopro.db ni à une base distante : DATABASE_URL
// est forcé à vide pour les deux sous-commandes, quel que soit .env.local.
import { existsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export const E2E_SQLITE_PATH = "data/test.db";

const env = { ...process.env, DATABASE_URL: "", SQLITE_PATH: E2E_SQLITE_PATH, ALLOW_REMOTE_DB_IN_DEV: "" };

for (const suffixe of ["", "-journal", "-wal", "-shm"]) {
  const f = path.resolve(E2E_SQLITE_PATH + suffixe);
  if (existsSync(f)) unlinkSync(f);
}

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", env });
  if (r.status !== 0) {
    console.error(`Échec (${r.status}) : ${cmd}`);
    process.exit(r.status ?? 1);
  }
}

run("npx drizzle-kit push --force");
run("npx tsx src/db/seed.ts");
// Données de la première version de l'éditeur de contrat (jetons en texte), puis la migration ponctuelle :
// la suite e2e vérifie ainsi que les contrats et le modèle hérités sont bien convertis
run("npx tsx scripts/e2e-donnees-heritees.ts");
run("npx tsx scripts/migrer-contrats-segments.ts");
console.log(`\nBase de test prête : ${E2E_SQLITE_PATH}`);
