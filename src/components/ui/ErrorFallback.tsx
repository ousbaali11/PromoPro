"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type ErrorProps = {
  error: Error & { digest?: string };
  /** Next.js ≥ 16.3 : re-fetch et re-render du segment */
  retry?: () => void;
  /** Ancienne API : réinitialise l'état d'erreur sans re-fetch */
  reset?: () => void;
};

/** Message d'erreur clair + bouton « Réessayer », partagé par les error.tsx des trois espaces. */
export function ErrorFallback({ error, retry, reset, espace }: ErrorProps & { espace: string }) {
  useEffect(() => {
    console.error(`[${espace}]`, error);
  }, [error, espace]);

  const relancer = () => (retry ?? reset)?.();

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-navy-900">Une erreur est survenue</h1>
      <p className="mt-2 text-sm text-navy-400">
        La page n&apos;a pas pu être affichée. Vous pouvez réessayer ; si le problème persiste, contactez votre
        administrateur en indiquant le code ci-dessous.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-navy-400">Code : {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={relancer}>
          <RotateCcw className="h-4 w-4" /> Réessayer
        </Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Recharger la page
        </Button>
      </div>
    </div>
  );
}
