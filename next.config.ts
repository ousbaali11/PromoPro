import type { NextConfig } from "next";
import { afficherBandeau, verifierGardeFouDev } from "./src/db/guard";

// Garde-fou `npm run dev` : refuse de démarrer sur une base PostgreSQL distante
// (sauf ALLOW_REMOTE_DB_IN_DEV=1) et affiche le bandeau vert/rouge dès le
// lancement. Sans effet sur `next build` / `next start`. Voir src/db/guard.ts.
if (process.env.npm_lifecycle_event === "dev") {
  verifierGardeFouDev();
  afficherBandeau();
}

const nextConfig: NextConfig = {
  // Build autonome (.next/standalone) : serveur Node minimal + dépendances
  // tracées, utilisé par le Dockerfile pour le déploiement conteneurisé.
  output: "standalone",
};

export default nextConfig;
