/*
 * Migration ponctuelle — éditeur de contrat par sections, seconde version :
 * convertit les modèles au format hérité ({{jetons}} en texte) en segments
 * structurés, et résout les jetons restants des contrats existants avec les
 * données de leur dossier. À lancer UNE fois après `npm run db:push` et le
 * déploiement du correctif, sur la base visée (DATABASE_URL de production
 * depuis `railway ssh`, ou la base SQLite locale) :
 *
 *   npm run migrer:contrats-segments
 *
 * Idempotente : relancer ne change rien. Voir DEPLOY.md, « Mises à jour ».
 */
import { closeDb } from "@/db/client";
import { migrerContratsSegments } from "@/lib/migration-contrats-segments";

async function main() {
  const bilan = await migrerContratsSegments();
  await closeDb();
  if (bilan.sectionsIgnorees.length) process.exitCode = 2;
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
