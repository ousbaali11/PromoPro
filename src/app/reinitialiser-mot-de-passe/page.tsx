import Link from "next/link";
import { KeyRound } from "lucide-react";
import { verifierJeton, MESSAGE_JETON_INVALIDE } from "@/lib/mot-de-passe-oublie";
import { Callout } from "@/components/ui/Primitives";
import { FormulaireNouveauMotDePasse } from "./FormulaireNouveauMotDePasse";

export const dynamic = "force-dynamic";

/*
 * Nouveau mot de passe depuis le lien reçu par e-mail. Le jeton est vérifié au
 * chargement (existe, non expiré, non utilisé, compte utilisable) puis de
 * nouveau à la soumission ; un lien invalide renvoie vers une nouvelle demande.
 */
export default async function ReinitialiserMotDePassePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const jeton = token ?? "";
  const verification = jeton ? await verifierJeton(jeton) : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-60" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-gold shadow-e3">
            <KeyRound className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-h1 text-white">Nouveau mot de passe</h1>
          {verification && (
            <p className="mt-1 text-small text-navy-100/70">
              {verification.utilisateur.prenom} {verification.utilisateur.nom} · {verification.utilisateur.identifiant}
            </p>
          )}
        </div>

        <div className="rounded-xl bg-white p-6 shadow-e5 ring-1 ring-white/10">
          {verification ? (
            <FormulaireNouveauMotDePasse jeton={jeton} />
          ) : (
            <div className="space-y-4">
              <Callout tone="danger" testId="jeton-invalide">
                {MESSAGE_JETON_INVALIDE}
              </Callout>
              <Link
                href="/mot-de-passe-oublie"
                className="block text-center text-small font-medium text-gold-600 underline-offset-2 hover:underline"
              >
                Faire une nouvelle demande
              </Link>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-caption">
          <Link href="/login" className="rounded-xs px-1 py-2 text-navy-100/70 underline-offset-2 hover:text-white hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
