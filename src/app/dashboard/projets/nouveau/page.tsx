"use client";

import { useActionState } from "react";
import { createProjet } from "../actions";
import { Card, Field, Input, PageHeader } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

export default function NouveauProjetPage() {
  const [state, formAction, pending] = useActionState(createProjet, undefined);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Nouveau projet" description="Saisie du projet et de ses informations bancaires." />
      <Card className="p-6">
        <form action={formAction} className="space-y-4">
          <Field label="Nom du projet" htmlFor="nom">
            <Input id="nom" name="nom" placeholder="ex. Résidence Al Manar" required />
          </Field>
          <Field label="Nom du compte / société" htmlFor="nomCompte">
            <Input id="nomCompte" name="nomCompte" placeholder="ex. SCI Al Manar" required />
          </Field>
          <Field label="IBAN" htmlFor="iban">
            <Input id="iban" name="iban" placeholder="MA00 0000 0000 0000 0000 0000" required />
          </Field>

          {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Création..." : "Créer le projet"}
          </Button>
          <p className="text-xs text-navy-400">
            Vous pourrez ajouter le tableau de contenance (les biens) juste après la création.
          </p>
        </form>
      </Card>
    </div>
  );
}
