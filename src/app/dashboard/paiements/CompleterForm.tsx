"use client";

import { useActionState } from "react";
import { completerReference } from "./actions";
import { Field, Input } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

/** Formulaire inline du Comptable Interne sur une ligne "En attente". */
export function CompleterForm({
  paiementId,
  montant,
  porteur,
}: {
  paiementId: string;
  montant: number;
  porteur: string | null;
}) {
  const action = completerReference.bind(null, paiementId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-md bg-navy-50 p-3 sm:grid-cols-5">
      <Field label="Référence" htmlFor={`ref-${paiementId}`}>
        <Input id={`ref-${paiementId}`} name="reference" placeholder="ex. VIR-2026-00123" required />
      </Field>
      <Field label="Montant exact reçu" htmlFor={`montant-${paiementId}`}>
        <Input id={`montant-${paiementId}`} name="montantExact" type="number" min={1} step={1} defaultValue={montant} required />
      </Field>
      <Field label="Date de réception" htmlFor={`date-${paiementId}`}>
        <Input id={`date-${paiementId}`} name="dateReception" type="date" required />
      </Field>
      <Field label="Porteur" htmlFor={`porteur-${paiementId}`}>
        <Input id={`porteur-${paiementId}`} name="porteur" defaultValue={porteur ?? ""} required />
      </Field>
      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? "Validation..." : "Valider"}
        </Button>
      </div>
      {state?.error && (
        <p className="col-span-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:col-span-5">{state.error}</p>
      )}
    </form>
  );
}
