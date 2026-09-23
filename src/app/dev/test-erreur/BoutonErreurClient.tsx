"use client";

/** Erreur non gérée côté navigateur (gestionnaire d'événement) : captée par le SDK client. */
export function BoutonErreurClient() {
  return (
    <button
      type="button"
      className="rounded-md bg-gold-600 px-3 py-2 text-small text-white"
      data-testid="bouton-erreur-client"
      onClick={() => {
        throw new Error("Erreur de test Sentry (client volontaire) — tél 06 12 34 56 78, CIN AB123456");
      }}
    >
      Erreur côté client
    </button>
  );
}
