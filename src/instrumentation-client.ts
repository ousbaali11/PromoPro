// Sentry côté navigateur. La DSN et l'environnement sont inscrits au build
// depuis SENTRY_DSN / SENTRY_ENVIRONMENT (next.config.ts, clé `env`) : sans
// DSN, le SDK est désactivé. Pas de Replay (il enregistrerait les écrans).
import * as Sentry from "@sentry/nextjs";
import { optionsSentry } from "@/lib/sentry-options";
import { environnementSentry } from "@/lib/sentry-filtre";

Sentry.init({
  ...optionsSentry({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environnement: environnementSentry({ SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT, NODE_ENV: process.env.NODE_ENV }),
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  }),
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
