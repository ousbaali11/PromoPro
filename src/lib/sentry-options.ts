import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { environnementSentry, nettoyerBreadcrumb, nettoyerEvenement } from "./sentry-filtre";

/*
 * Options communes aux trois initialisations Sentry (client, serveur, edge).
 * - DSN : uniquement depuis l'environnement (SENTRY_DSN côté serveur, copiée
 *   dans NEXT_PUBLIC_SENTRY_DSN au build pour le navigateur) ; sans DSN le SDK
 *   est désactivé et l'application fonctionne normalement.
 * - environment : SENTRY_ENVIRONMENT sinon NODE_ENV (development / production).
 * - Aucune donnée personnelle par défaut (sendDefaultPii: false) et filtrage
 *   systématique par beforeSend / beforeBreadcrumb (src/lib/sentry-filtre.ts).
 * - Erreurs seulement : pas de traces ni de replay (ils captureraient URL,
 *   paramètres et écrans contenant des données de clients).
 */
export function optionsSentry(params: { dsn?: string; environnement: string; release?: string }) {
  const dsn = params.dsn?.trim() || undefined;
  return {
    dsn,
    enabled: !!dsn,
    environment: params.environnement,
    release: params.release?.trim() || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 30,
    beforeSend(event: ErrorEvent) {
      return nettoyerEvenement(event);
    },
    beforeBreadcrumb(miette: Breadcrumb) {
      return nettoyerBreadcrumb(miette);
    },
  };
}

/** Côté serveur / edge : variables lues au démarrage du processus. */
export function optionsServeur() {
  return optionsSentry({
    dsn: process.env.SENTRY_DSN,
    environnement: environnementSentry({ SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT, NODE_ENV: process.env.NODE_ENV }),
    release: process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA,
  });
}
