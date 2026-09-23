// Sentry côté serveur Node (Server Components, Server Actions, routes API).
// Chargé par src/instrumentation.ts au démarrage. Voir src/lib/sentry-options.ts.
import * as Sentry from "@sentry/nextjs";
import { optionsServeur } from "@/lib/sentry-options";

Sentry.init({
  ...optionsServeur(),
  // Jamais les variables locales des piles d'appel : elles contiendraient les valeurs des formulaires
  includeLocalVariables: false,
});
