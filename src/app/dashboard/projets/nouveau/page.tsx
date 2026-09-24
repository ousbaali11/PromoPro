"use client";

import { useActionState } from "react";

import { createProjet } from "../actions";
import { Card, Input, PageHeader, Callout, Breadcrumb } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

export default function NouveauProjetPage() {
  const [state, formAction, pending] = useActionState(createProjet, undefined);

  return (
    <div className="mx-auto max-w-lg">
      <Breadcrumb items={[{ label: "Projets", href: "/dashboard/projets" }, { label: "Nouveau projet" }]} />
      <PageHeader eyebrow="Projets & biens" title="Nouveau projet" description="Saisie du projet et de ses informations bancaires." />
      <Card className="p-6">
        <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-4" data-testid="form-nouveau-projet">
          <Input id="nom" name="nom" label="Nom du projet" hint="ex. Résidence Al Manar" required />
          <Input id="nomCompte" name="nomCompte" label="Nom du compte / société" hint="ex. SCI Al Manar" required />
          <Input
            id="iban"
            name="iban"
            label="IBAN"
            hint="Compte qui recevra les paiements des clients. Il figure sur les contrats."
            className="font-mono"
            required
          />

          {state?.error && <Callout tone="danger">{state.error}</Callout>}

          <Button type="submit" loading={pending} className="w-full">
            Créer le projet
          </Button>
          <p className="text-caption text-navy-400">
            Vous pourrez ajouter le tableau de contenance (les biens) juste après la création.
          </p>
        </form>
      </Card>
    </div>
  );
}
