"use client";

import { useActionState } from "react";
import { createPromoteur } from "../actions";
import { Card, Field, Input, PageHeader } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

export default function NouveauPromoteurPage() {
  const [state, formAction, pending] = useActionState(createPromoteur, undefined);

  if (state?.success) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Promoteur créé" />
        <Card className="p-6">
          <p className="text-sm text-navy-900">
            Le compte du promoteur est créé, en attente d&apos;activation. Voici les identifiants du PDG :
          </p>
          <div className="mt-4 space-y-2 rounded-md bg-navy-50 p-4 font-mono text-sm">
            <p>Identifiant : {state.success.identifiant}</p>
            <p>Mot de passe : {state.success.password}</p>
          </div>
          <p className="mt-4 text-xs text-navy-400">
            L&apos;accès reste bloqué tant que l&apos;abonnement n&apos;est pas activé depuis la liste des
            promoteurs.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Nouveau promoteur" description="Création du compte et du premier accès (PDG)." />
      <Card className="p-6">
        <form action={formAction} className="space-y-4">
          <Field label="Nom du promoteur" htmlFor="nom">
            <Input id="nom" name="nom" placeholder="ex. PromoPro" required />
          </Field>
          <Field label="E-mail de contact" htmlFor="contactEmail">
            <Input id="contactEmail" name="contactEmail" type="email" />
          </Field>
          <Field label="Nom du PDG" htmlFor="pdgNom">
            <Input id="pdgNom" name="pdgNom" required />
          </Field>
          <Field label="Prénom du PDG" htmlFor="pdgPrenom">
            <Input id="pdgPrenom" name="pdgPrenom" required />
          </Field>

          {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Création..." : "Créer le promoteur"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
