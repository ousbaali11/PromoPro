"use client";

import { FileUpload } from "@/components/ui/FileUpload";

import { useActionState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { createPromoteur, type Acces } from "../actions";
import { Card, Input, PageHeader, Callout, Breadcrumb } from "@/components/ui/Primitives";
import { Button, LinkButton } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/roles";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

const DIRECTIONS = [
  { champ: "pdg", libelle: "PDG", aide: "Décide des propositions de vente et bloque des biens." },
  { champ: "dircom", libelle: "Directeur Commercial", aide: "Crée les projets et recrute le pôle commercial et administratif." },
  { champ: "dirfin", libelle: "Directeur Financier", aide: "Suit la trésorerie et recrute le pôle financier." },
];

function BlocAcces({ acces }: { acces: Acces }) {
  return (
    <Card elevation={0} className="p-4" data-testid="bloc-acces">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-small font-medium text-navy-900">{ROLE_LABELS[acces.role]}</p>
          <p className="text-caption text-navy-400">
            {acces.prenom} {acces.nom}
          </p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold-50 text-gold-600">
          <KeyRound className="h-4 w-4" />
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-sm bg-navy-50 px-3 py-2.5 font-mono text-small">
        <dt className="text-navy-400">Identifiant</dt>
        <dd className="text-navy-900">{acces.identifiant}</dd>
        <dt className="text-navy-400">Mot de passe</dt>
        <dd className="text-navy-900">{acces.password}</dd>
      </dl>
    </Card>
  );
}

export default function NouveauPromoteurPage() {
  const [state, formAction, pending] = useActionState(createPromoteur, undefined);

  if (state?.success) {
    const { promoteur, acces } = state.success;
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader eyebrow={promoteur} title="Promoteur créé" description="En attente d'activation de l'abonnement." />
        <Card className="space-y-4 p-6">
          <p className="text-body text-navy-900">
            Trois accès ont été créés. Communiquez à chaque direction ses propres identifiants (ils ne seront pas
            affichés à nouveau) :
          </p>
          <BlocAcces acces={acces.pdg} />
          <BlocAcces acces={acces.directeurCommercial} />
          <BlocAcces acces={acces.directeurFinancier} />
          <p className="text-caption text-navy-400">
            L&apos;accès reste bloqué tant que l&apos;abonnement n&apos;est pas activé depuis la liste des
            promoteurs. Les directeurs recruteront ensuite leurs équipes depuis la page « Équipe ».
          </p>
          <LinkButton href="/admin" variant="secondary" className="w-full">
            <ArrowLeft className="h-4 w-4" /> Retour à la liste des promoteurs
          </LinkButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Breadcrumb items={[{ label: "Promoteurs", href: "/admin" }, { label: "Nouveau promoteur" }]} />
      <PageHeader
        eyebrow="Administration plateforme"
        title="Nouveau promoteur"
        description="Création du promoteur et de ses trois directions : PDG, Directeur Commercial, Directeur Financier."
      />
      <Card className="p-6">
        <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-6" data-testid="form-nouveau-promoteur">
          <div className="space-y-3">
            <Input
              id="nom"
              name="nom"
              label="Nom du promoteur"
              hint="Raison sociale telle qu'elle apparaîtra sur les contrats."
              required
            />
            <Input id="contactEmail" name="contactEmail" type="email" label="E-mail de contact" />
            <FileUpload
              name="logoUrl"
              type="logos"
              label="Logo (optionnel)"
              accept=".png,.jpg,.jpeg"
              hint="PNG ou JPG : en-tête des contrats, reçus, autorisations de visite et de l'espace client. Modifiable ensuite depuis la liste."
            />
          </div>

          {DIRECTIONS.map((d, i) => (
            <fieldset key={d.champ} className="rounded-md border border-navy-100 p-4">
              <legend className="flex items-center gap-2 px-1 text-small font-medium text-navy-900">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white tabular">
                  {i + 1}
                </span>
                {d.libelle}
              </legend>
              <p className="mb-3 text-caption text-navy-400">{d.aide}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input id={`${d.champ}Nom`} name={`${d.champ}Nom`} label="Nom" required />
                <Input id={`${d.champ}Prenom`} name={`${d.champ}Prenom`} label="Prénom" required />
              </div>
            </fieldset>
          ))}

          {state?.error && <Callout tone="danger">{state.error}</Callout>}

          <Button type="submit" loading={pending} className="w-full">
            Créer le promoteur et ses trois directions
          </Button>
        </form>
      </Card>
    </div>
  );
}
