"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { modifierClient } from "../../actions";
import { Card, Input, Select, Callout } from "@/components/ui/Primitives";
import { Button, LinkButton } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

type ClientForm = {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  adresse: string | null;
  pieceType: string | null;
  pieceNumero: string | null;
  pieceDocUrl: string | null;
  telephone1: string | null;
  telephone2: string | null;
  email: string | null;
};

export function ModifierClientForm({ client }: { client: ClientForm }) {
  const [state, formAction, pending] = useActionState(modifierClient, undefined);
  return (
    <Card className="p-6">
      <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-6" data-testid="form-modifier-client">
        <input type="hidden" name="clientId" value={client.id} />
        <fieldset className="space-y-3">
          <legend className="mb-3 text-h3 text-navy-900">Identité</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input id="nom" name="nom" label="Nom" defaultValue={client.nom} required />
            <Input id="prenom" name="prenom" label="Prénom" defaultValue={client.prenom} required />
            <Input id="dateNaissance" name="dateNaissance" type="date" label="Date de naissance" defaultValue={client.dateNaissance ?? ""} clearable={false} />
            <Input id="lieuNaissance" name="lieuNaissance" label="Lieu de naissance" defaultValue={client.lieuNaissance ?? ""} />
            <Input id="adresse" name="adresse" label="Adresse" defaultValue={client.adresse ?? ""} containerClassName="sm:col-span-2" />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-h3 text-navy-900">Pièce d&apos;identité</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select id="pieceType" name="pieceType" label="Type de pièce" defaultValue={client.pieceType ?? "CIN"}>
              <option value="CIN">CIN</option>
              <option value="PASSEPORT">Passeport</option>
            </Select>
            <Input id="pieceNumero" name="pieceNumero" label="Numéro de pièce" defaultValue={client.pieceNumero ?? ""} className="font-mono" />
          </div>
          <FileUpload
            name="pieceDocUrl"
            type="pieces-identite"
            label={client.pieceDocUrl ? "Remplacer le scan de la pièce" : "Scan de la pièce d'identité"}
            hint="Laissez vide pour conserver le document actuel."
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-h3 text-navy-900">Contact</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input id="telephone1" name="telephone1" type="tel" label="Téléphone 1" defaultValue={client.telephone1 ?? ""} required />
            <Input id="telephone2" name="telephone2" type="tel" label="Téléphone 2 (facultatif)" defaultValue={client.telephone2 ?? ""} />
            <Input id="email" name="email" type="email" label="E-mail" defaultValue={client.email ?? ""} containerClassName="sm:col-span-2" required />
          </div>
        </fieldset>

        {state?.error && <Callout tone="danger">{state.error}</Callout>}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            <Save className="h-4 w-4" /> Enregistrer les modifications
          </Button>
          <LinkButton href={`/dashboard/clients/${client.id}`} variant="ghost">
            Annuler
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
