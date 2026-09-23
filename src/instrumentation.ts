import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

/*
 * Instrumentation serveur Next.js : initialise Sentry selon le runtime et
 * transmet à Sentry toute erreur non gérée capturée par le serveur —
 * Server Components, **Server Actions** et **routes API** (routeType
 * « render » / « action » / « route »), avec le chemin de la route en tag.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

export const onRequestError: Instrumentation.onRequestError = (erreur, requete, contexte) => {
  Sentry.captureRequestError(erreur, requete, contexte);
};
