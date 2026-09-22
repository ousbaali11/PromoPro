"use client";

import { useActionState, useState } from "react";
import { createProposition } from "../actions";
import { Card, Field, Input, Select } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

type ClientRow = { id: string; nom: string; prenom: string; telephone1: string | null };

const DEFAULT_PCT = [40, 20, 20, 20];

export function NewPropositionForm({
  bienId,
  clients,
  defaultDates,
}: {
  bienId: string;
  clients: ClientRow[];
  defaultDates: string[];
}) {
  const [state, formAction, pending] = useActionState(createProposition, undefined);
  const [clientChoice, setClientChoice] = useState(clients[0]?.id ?? "__nouveau__");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="bienId" value={bienId} />

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-medium text-navy-900">Client</h2>
        <Field label="Sélectionner un client" htmlFor="clientId">
          <Select
            id="clientId"
            name="clientId"
            value={clientChoice}
            onChange={(e) => setClientChoice(e.target.value)}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.prenom} {c.nom} {c.telephone1 ? `· ${c.telephone1}` : ""}
              </option>
            ))}
            <option value="__nouveau__">+ Nouveau client</option>
          </Select>
        </Field>

        {clientChoice === "__nouveau__" && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom" htmlFor="clientNom">
              <Input id="clientNom" name="clientNom" required />
            </Field>
            <Field label="Prénom" htmlFor="clientPrenom">
              <Input id="clientPrenom" name="clientPrenom" required />
            </Field>
            <Field label="Téléphone" htmlFor="clientTelephone1">
              <Input id="clientTelephone1" name="clientTelephone1" required />
            </Field>
            <Field label="E-mail" htmlFor="clientEmail">
              <Input id="clientEmail" name="clientEmail" type="email" required />
            </Field>
            <Field label="CIN / Passeport" htmlFor="clientPiece">
              <Input id="clientPiece" name="clientPiece" />
            </Field>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-medium text-navy-900">Échéancier de paiement</h2>
        <p className="mb-4 text-xs text-navy-400">
          Par défaut : 40% le jour du blocage, puis 20% tous les 6 mois. Vous pouvez modifier les pourcentages et
          les dates.
        </p>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n, i) => (
            <div key={n} className="grid grid-cols-3 gap-3 rounded-md bg-navy-50 p-3">
              <div className="flex items-center text-xs font-medium text-navy-900">Tranche {n}</div>
              <Field label="Pourcentage" htmlFor={`tranche${n}Pourcentage`}>
                <Input
                  id={`tranche${n}Pourcentage`}
                  name={`tranche${n}Pourcentage`}
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={DEFAULT_PCT[i]}
                  required
                />
              </Field>
              <Field label="Date" htmlFor={`tranche${n}Date`}>
                <Input
                  id={`tranche${n}Date`}
                  name={`tranche${n}Date`}
                  type="date"
                  defaultValue={defaultDates[i]}
                  required
                />
              </Field>
            </div>
          ))}
        </div>
      </Card>

      {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}

      <Button type="submit" variant="gold" disabled={pending} className="w-full">
        {pending ? "Envoi..." : "Envoyer la proposition au PDG"}
      </Button>
    </form>
  );
}
