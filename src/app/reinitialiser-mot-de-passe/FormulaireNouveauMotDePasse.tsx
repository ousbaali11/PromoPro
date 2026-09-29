"use client";

import { useActionState } from "react";
import Link from "next/link";
import { appliquerNouveauMotDePasse } from "./actions";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Primitives";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";
import { MOT_DE_PASSE_MIN } from "@/lib/reinitialisation-regles";

export function FormulaireNouveauMotDePasse({ jeton }: { jeton: string }) {
  const [state, formAction, pending] = useActionState(appliquerNouveauMotDePasse, undefined);

  return (
    <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-3" data-testid="form-nouveau-mot-de-passe">
      <input type="hidden" name="token" value={jeton} />
      <Input
        id="motDePasse"
        name="motDePasse"
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        hint={`${MOT_DE_PASSE_MIN} caractères au moins, avec une lettre et un chiffre.`}
      />
      <Input id="confirmation" name="confirmation" label="Confirmez le mot de passe" type="password" autoComplete="new-password" required />
      {state?.error && (
        <Callout tone="danger" testId="erreur-mot-de-passe">
          {state.error}
          {state.jetonInvalide && (
            <>
              {" "}
              <Link href="/mot-de-passe-oublie" className="font-medium underline underline-offset-2">
                Faire une nouvelle demande
              </Link>
            </>
          )}
        </Callout>
      )}
      <Button type="submit" loading={pending} className="mt-3 w-full" size="lg">
        Enregistrer le nouveau mot de passe
      </Button>
    </form>
  );
}
