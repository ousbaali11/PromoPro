// Prototype isolé : lit chaque plan réel du dossier scripts/prototypes/plans/reels/ avec
// test-lecture-plan.ts (logique inchangée), puis construit le .glb avec plan-vers-glb.ts.
// Usage : GEMINI_API_KEY et GEMINI_MODEL dans l'environnement, puis
//   node scripts/prototypes/lancer-lot.mjs [dossier]
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const dossier = path.resolve(process.argv[2] ?? "scripts/prototypes/plans/reels");
if (!existsSync(dossier)) {
  console.error(`Dossier introuvable : ${dossier}. Déposez-y les plans (PNG ou JPG).`);
  process.exit(1);
}
const plans = readdirSync(dossier).filter((f) => /\.(png|jpe?g)$/i.test(f));
if (plans.length === 0) {
  console.error(`Aucun plan PNG/JPG dans ${dossier}.`);
  process.exit(1);
}
for (const f of plans) {
  const image = path.join(dossier, f);
  console.log(`\n==================== ${f}`);
  const lecture = spawnSync("npx", ["tsx", "scripts/prototypes/test-lecture-plan.ts", image], { stdio: "inherit", shell: true, env: process.env });
  if (lecture.status !== 0) {
    console.error(`Lecture échouée pour ${f}`);
    continue;
  }
  const json = image.replace(/\.(png|jpe?g)$/i, "") + ".gemini.json";
  const glb = image.replace(/\.(png|jpe?g)$/i, "") + ".glb";
  spawnSync("npx", ["tsx", "scripts/prototypes/plan-vers-glb.ts", json, glb, "15", "10"], { stdio: "inherit", shell: true, env: process.env });
}
