"use client";

import { useActionState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { createClient } from "../actions";
import { Card, Input, Select, PageHeader, Callout, Breadcrumb } from "@/components/ui/Primitives";
import { Button, LinkButton } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";

export default function NouveauClientPage() {
  const [state, formAction, pending] = useActionState(createClient, undefined);

  if (state?.success) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader eyebrow="Clients" title="Client créé" description="Le compte d'accès à l'espace client est actif." />
        <Card className="space-y-4 p-6">
          <p className="text-body text-navy-900">
            Communiquez ces identifiants au client (à conserver, ils ne seront pas affichés à nouveau) :
          </p>
          <Card elevation={0} className="p-4" data-testid="bloc-acces">
            <div className="flex items-start justify-between gap-3">
              <p className="text-small font-medium text-navy-900">Accès à l&apos;espace client</p>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold-50 text-gold-600">
                <KeyRound className="h-4 w-4" />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-sm bg-navy-50 px-3 py-2.5 font-mono text-small">
              <dt className="text-navy-400">Identifiant</dt>
              <dd className="text-navy-900">{state.success.identifiant}</dd>
              <dt className="text-navy-400">Mot de passe</dt>
              <dd className="text-navy-900">{state.success.password}</dd>
            </dl>
          </Card>
          <LinkButton href="/dashboard/clients" variant="secondary" className="w-full">
            <ArrowLeft className="h-4 w-4" /> Retour à la liste des clients
          </LinkButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Breadcrumb items={[{ label: "Clients", href: "/dashboard/clients" }, { label: "Nouveau client" }]} />
      <PageHeader eyebrow="Clients" title="Nouveau client" description="Création du dossier et du compte d'accès du client." />
      <Card className="p-6">
        <form action={formAction} className="space-y-6" data-testid="form-nouveau-client">
          <fieldset className="space-y-3">
            <legend className="mb-3 text-h3 text-navy-900">Identité</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input id="nom" name="nom" label="Nom" required />
              <Input id="prenom" name="prenom" label="Prénom" required />
              <Input id="dateNaissance" name="dateNaissance" type="date" label="Date de naissance" clearable={false} />
              <Input id="lieuNaissance" name="lieuNaissance" label="Lieu de naissance" />
              <Input id="adresse" name="adresse" label="Adresse" containerClassName="sm:col-span-2" />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-3 text-h3 text-navy-900">Pièce d&apos;identité</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select id="pieceType" name="pieceType" label="Type de pièce" defaultValue="CIN">
                <option value="CIN">CIN</option>
                <option value="PASSEPORT">Passeport</option>
              </Select>
              <Input id="pieceNumero" name="pieceNumero" label="Numéro de pièce" className="font-mono" />
            </div>
            <FileUpload
              name="pieceDocUrl"
              type="pieces-identite"
              label="Scan de la pièce d'identité"
              hint="CIN ou passeport, au format PDF ou image."
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-3 text-h3 text-navy-900">Contact</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input id="telephone1" name="telephone1" type="tel" label="Téléphone 1" required />
              <Input id="telephone2" name="telephone2" type="tel" label="Téléphone 2 (facultatif)" />
              <Input id="email" name="email" type="email" label="E-mail" containerClassName="sm:col-span-2" required />
            </div>
          </fieldset>

          {state?.error && <Callout tone="danger">{state.error}</Callout>}

          <Button type="submit" loading={pending} className="w-full">
            Créer le client
          </Button>
        </form>
      </Card>
    </div>
  );
}
