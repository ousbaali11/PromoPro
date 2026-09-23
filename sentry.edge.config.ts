// Sentry pour le runtime edge (aucune route edge aujourd'hui ; prêt si une apparaît).
import * as Sentry from "@sentry/nextjs";
import { optionsServeur } from "@/lib/sentry-options";

Sentry.init(optionsServeur());
