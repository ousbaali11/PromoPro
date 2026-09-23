"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

/**
 * Dernier filet : erreur dans la mise en page racine elle-même (les erreurs
 * des espaces passent par leurs error.tsx). Remontée à Sentry, puis page
 * minimale autonome — global-error remplace le layout racine, sans ses styles.
 */
export default function GlobalError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "4rem 1rem", textAlign: "center", color: "#1f2a44" }}>
        <h1 style={{ fontSize: "1.25rem" }}>Une erreur est survenue</h1>
        <p style={{ color: "#587393" }}>
          L&apos;application n&apos;a pas pu s&apos;afficher. Réessayez ; si le problème persiste, contactez votre administrateur
          {error.digest ? ` en indiquant le code ${error.digest}` : ""}.
        </p>
        <p>
          <button type="button" onClick={() => (retry ?? reset)?.()} style={{ padding: "0.5rem 1rem", marginRight: "0.5rem" }}>
            Réessayer
          </button>
          <Link href="/">Retour à l&apos;accueil</Link>
        </p>
      </body>
    </html>
  );
}
