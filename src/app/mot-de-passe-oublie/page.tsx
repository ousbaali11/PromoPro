"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { demanderLien } from "./actions";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Primitives";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

/*
 * Mot de passe oublié (comptes internes). L'identifiant est demandé, pas
 * l'e-mail : c'est ce que l'utilisateur connaît. La réponse est identique que
 * le compte existe ou non. Un compte sans e-mail voit en plus l'invitation à
 * contacter la personne qui l'a créé (sa direction, ou le Super Admin pour une
 * direction) : c'est elle qui remet un nouveau mot de passe.
 */
export default function MotDePasseOubliePage() {
  const [state, formAction, pending] = useActionState(demanderLien, undefined);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-60" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-gold shadow-e3">
            <KeyRound className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-h1 text-white">Mot de passe oublié</h1>
          <p className="mt-1 text-small text-navy-100/70">Comptes internes du promoteur et administration</p>
        </div>

        <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="rounded-xl bg-white p-6 shadow-e5 ring-1 ring-white/10" data-testid="form-mot-de-passe-oublie">
          {state?.message ? (
            <div className="space-y-4">
              <Callout tone="success" testId="demande-envoyee">
                {state.message}
              </Callout>
              {state.sansEmail && (
                <Callout tone="warning" testId="sans-email">
                  Aucune adresse e-mail n&apos;est associée à ce compte. Contactez la personne qui l&apos;a créé (votre direction, ou
                  l&apos;administrateur de la plateforme pour une direction) : elle vous remettra un nouveau mot de passe.
                </Callout>
              )}
              <p className="text-caption text-navy-400">
                Le lien reçu est valable une heure. Vérifiez aussi le dossier des courriers indésirables.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-small text-navy-500">
                Indiquez votre identifiant de connexion : si un e-mail est associé à votre compte, vous y recevrez un lien pour
                choisir un nouveau mot de passe.
              </p>
              <Input id="identifiant" name="identifiant" label="Identifiant" autoComplete="username" required autoFocus />
              {state?.error && (
                <Callout tone="danger" className="mt-4">
                  {state.error}
                </Callout>
              )}
              <Button type="submit" loading={pending} className="mt-6 w-full" size="lg">
                Envoyer le lien
              </Button>
            </>
          )}
        </form>

        <p className="mt-4 text-center text-caption">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 rounded-xs px-1 py-2 text-navy-100/70 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
