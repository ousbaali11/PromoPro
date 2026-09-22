"use client";

import { useActionState } from "react";
import { createPromoteur, type Acces } from "../actions";
import { Card, Field, Input, PageHeader } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/roles";

const DIRECTIONS = [
  { champ: "pdg", libelle: "PDG", aide: "Décide des propositions de vente et bloque des biens." },
  { champ: "dircom", libelle: "Directeur Commercial", aide: "Crée les projets et recrute le pôle commercial et administratif." },
  { champ: "dirfin", libelle: "Directeur Financier", aide: "Suit la trésorerie et recrute le pôle financier." },
];

function BlocAcces({ acces }: { acces: Acces }) {
  return (
    <div className="rounded-md border border-navy-100 p-4">
      <p className="text-sm font-medium text-navy-900">{ROLE_LABELS[acces.role]}</p>
      <p className="text-xs text-navy-400">
        {acces.prenom} {acces.nom}
      </p>
      <div className="mt-2 space-y-1 rounded-md bg-navy-50 p-3 font-mono text-sm">
        <p>Identifiant : {acces.identifiant}</p>
        <p>Mot de passe : {acces.password}</p>
      </div>
    </div>
  );
}

export default function NouveauPromoteurPage() {
  const [state, formAction, pending] = useActionState(createPromoteur, undefined);

  if (state?.success) {
    const { promoteur, acces } = state.success;
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Promoteur créé" description={`${promoteur} — en attente d'activation de l'abonnement.`} />
        <Card className="space-y-4 p-6">
          <p className="text-sm text-navy-900">
            Trois accès ont été créés. Communiquez à chaque direction ses propres identifiants (ils ne seront pas
            affichés à nouveau) :
          </p>
          <BlocAcces acces={acces.pdg} />
          <BlocAcces acces={acces.directeurCommercial} />
          <BlocAcces acces={acces.directeurFinancier} />
          <p className="text-xs text-navy-400">
            L&apos;accès reste bloqué tant que l&apos;abonnement n&apos;est pas activé depuis la liste des
            promoteurs. Les directeurs recruteront ensuite leurs équipes depuis la page « Équipe ».
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Nouveau promoteur"
        description="Création du promoteur et de ses trois directions : PDG, Directeur Commercial, Directeur Financier."
      />
      <Card className="p-6">
        <form action={formAction} className="space-y-6">
          <div className="space-y-4">
            <Field label="Nom du promoteur" htmlFor="nom">
              <Input id="nom" name="nom" placeholder="ex. PromoPro" required />
            </Field>
            <Field label="E-mail de contact" htmlFor="contactEmail">
              <Input id="contactEmail" name="contactEmail" type="email" />
            </Field>
          </div>

          {DIRECTIONS.map((d) => (
            <fieldset key={d.champ} className="rounded-md border border-navy-100 p-4">
              <legend className="px-1 text-sm font-medium text-navy-900">{d.libelle}</legend>
              <p className="mb-3 text-xs text-navy-400">{d.aide}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nom" htmlFor={`${d.champ}Nom`}>
                  <Input id={`${d.champ}Nom`} name={`${d.champ}Nom`} required />
                </Field>
                <Field label="Prénom" htmlFor={`${d.champ}Prenom`}>
                  <Input id={`${d.champ}Prenom`} name={`${d.champ}Prenom`} required />
                </Field>
              </div>
            </fieldset>
          ))}

          {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Création..." : "Créer le promoteur et ses trois directions"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
