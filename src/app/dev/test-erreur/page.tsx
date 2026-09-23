import { notFound } from "next/navigation";
import { declencherErreurTest } from "./actions";
import { BoutonErreurClient } from "./BoutonErreurClient";

/**
 * Page de test Sentry — développement seulement (404 en production).
 * Trois vecteurs : route API (/api/test-erreur), Server Action (formulaire
 * ci-dessous, rempli de fausses données sensibles) et erreur côté client.
 */
export default function PageTestErreur() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-lg space-y-6 p-8">
      <h1 className="text-h2 text-navy-900">Test de remontée Sentry (développement)</h1>
      <p className="text-small text-navy-400">
        Chaque bouton provoque une erreur volontaire. Dans Sentry, l&apos;environnement doit être « development » et toutes les
        valeurs ci-dessous doivent apparaître comme « [masqué] ».
      </p>
      <form action={declencherErreurTest} className="space-y-2" data-testid="form-test-action">
        <input type="hidden" name="motDePasse" value="secret-123" />
        <input type="hidden" name="cin" value="AB123456" />
        <input type="hidden" name="telephone" value="06 12 34 56 78" />
        <button type="submit" className="rounded-md bg-navy-900 px-3 py-2 text-small text-white">
          Erreur dans une Server Action
        </button>
      </form>
      <p>
        <a href="/api/test-erreur" className="text-small underline">
          Erreur dans une route API (/api/test-erreur)
        </a>
      </p>
      <BoutonErreurClient />
    </main>
  );
}
