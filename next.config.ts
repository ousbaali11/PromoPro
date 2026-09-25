import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { afficherBandeau, verifierGardeFouDev } from "./src/db/guard";

// Garde-fou `npm run dev` : refuse de démarrer sur une base PostgreSQL distante
// (sauf ALLOW_REMOTE_DB_IN_DEV=1) et affiche le bandeau vert/rouge dès le
// lancement. Sans effet sur `next build` / `next start`. Voir src/db/guard.ts.
if (process.env.npm_lifecycle_event === "dev") {
  verifierGardeFouDev();
  afficherBandeau();
}

const nextConfig: NextConfig = {
  // Sentry côté navigateur : la DSN et l'environnement viennent des variables
  // serveur SENTRY_DSN / SENTRY_ENVIRONMENT, inscrites au build sous un nom
  // public (la DSN n'est pas un secret : elle est visible dans tout navigateur).
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.SENTRY_RELEASE ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "",
  },
  // Build autonome (.next/standalone) : serveur Node minimal + dépendances
  // tracées, utilisé par le Dockerfile pour le déploiement conteneurisé.
  output: "standalone",
  // Tests de bout en bout (serveur de dev lancé par Playwright avec E2E_TESTS=1) : le badge de
  // l'overlay de développement, ancré en bas à gauche, recouvrait des boutons sur petit écran et
  // interceptait les clics ; il est retiré pendant les tests, jamais en développement courant.
  devIndicators: process.env.E2E_TESTS === "1" ? false : undefined,
  // Import Excel des prospects : le fichier transite par une Server Action
  // (lu en mémoire, jamais stocké) ; la limite par défaut est de 1 Mo.
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
};

// Envoi des source maps à Sentry uniquement si SENTRY_AUTH_TOKEN (et SENTRY_ORG /
// SENTRY_PROJECT) sont fournis au build ; sinon le plugin reste silencieux.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
