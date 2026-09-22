"use client";

import { useActionState } from "react";
import { createClient } from "../actions";
import { Card, Field, Input, Select, PageHeader } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

export default function NouveauClientPage() {
  const [state, formAction, pending] = useActionState(createClient, undefined);

  if (state?.success) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Client créé" />
        <Card className="p-6">
          <p className="text-sm text-navy-900">
            Le compte a été créé. Communiquez ces identifiants au client (à conserver, non affichés à nouveau) :
          </p>
          <div className="mt-4 space-y-2 rounded-md bg-navy-50 p-4 font-mono text-sm">
            <p>Identifiant : {state.success.identifiant}</p>
            <p>Mot de passe : {state.success.password}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Nouveau client" description="Création du dossier et du compte d'accès du client." />
      <Card className="p-6">
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom" htmlFor="nom">
              <Input id="nom" name="nom" required />
            </Field>
            <Field label="Prénom" htmlFor="prenom">
              <Input id="prenom" name="prenom" required />
            </Field>
            <Field label="Date de naissance" htmlFor="dateNaissance">
              <Input id="dateNaissance" name="dateNaissance" type="date" />
            </Field>
            <Field label="Lieu de naissance" htmlFor="lieuNaissance">
              <Input id="lieuNaissance" name="lieuNaissance" />
            </Field>
            <Field label="Adresse" htmlFor="adresse">
              <Input id="adresse" name="adresse" />
            </Field>
            <Field label="Pièce d'identité" htmlFor="pieceType">
              <Select id="pieceType" name="pieceType" defaultValue="CIN">
                <option value="CIN">CIN</option>
                <option value="PASSEPORT">Passeport</option>
              </Select>
            </Field>
            <Field label="Numéro de pièce" htmlFor="pieceNumero">
              <Input id="pieceNumero" name="pieceNumero" />
            </Field>
            <Field label="Téléphone 1" htmlFor="telephone1">
              <Input id="telephone1" name="telephone1" required />
            </Field>
            <Field label="Téléphone 2 (facultatif)" htmlFor="telephone2">
              <Input id="telephone2" name="telephone2" />
            </Field>
            <Field label="E-mail" htmlFor="email">
              <Input id="email" name="email" type="email" required />
            </Field>
          </div>

          <p className="text-xs text-navy-400">
            Le scan de la pièce d&apos;identité se fait via la fonctionnalité d&apos;upload (à brancher — voir
            PROMPTS.md, module Clients).
          </p>

          {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Création..." : "Créer le client"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
