import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

/*
 * Instrumentation serveur Next.js : initialise Sentry selon le runtime et
 * transmet à Sentry toute erreur non gérée capturée par le serveur —
 * Server Components, **Server Actions** et **routes API** (routeType
 * « render » / « action » / « route »), avec le chemin de la route en tag.
 *
 * Au démarrage du runtime Node, vérifie aussi que le disque des uploads
 * (UPLOAD_DIR, volume monté en production) est inscriptible : un volume mal
 * monté ou appartenant à root est signalé dans les journaux et dans Sentry
 * dès le lancement, au lieu d'être découvert par un utilisateur au premier
 * dépôt de fichier (EACCES sur mkdir, Railway, septembre 2026). L'import de
 * src/lib/storage.ts (node:fs) reste à l'intérieur du garde NEXT_RUNTIME pour
 * ne pas être embarqué dans le bundle Edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    try {
      const { verifierStockage } = await import("./lib/storage");
      const etat = await verifierStockage();
      if (etat.ok) {
        console.log(`[stockage] dossier des uploads inscriptible : ${etat.racine}`);
      } else {
        console.error(`[stockage] ${etat.message}`);
        Sentry.captureException(etat.erreur, { level: "error", tags: { stockage: "uploads", contexte: "demarrage" } });
      }
    } catch (e) {
      // La vérification ne doit jamais empêcher le serveur de démarrer
      console.error("[stockage] vérification du dossier des uploads impossible :", e);
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

export const onRequestError: Instrumentation.onRequestError = (erreur, requete, contexte) => {
  Sentry.captureRequestError(erreur, requete, contexte);
};
