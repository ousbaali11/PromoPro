"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { completerReference } from "./actions";
import { Input, Callout } from "@/components/ui/Primitives";
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
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-md bg-navy-50 p-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="form-completer">
      <Input id={`ref-${paiementId}`} name="reference" label="Référence" hint="ex. VIR-2026-00123" className="font-mono" required />
      <Input id={`montant-${paiementId}`} name="montantExact" type="number" label="Montant exact reçu" min={1} step={1} defaultValue={montant} clearable={false} required />
      <Input id={`date-${paiementId}`} name="dateReception" type="date" label="Date de réception" clearable={false} required />
      <Input id={`porteur-${paiementId}`} name="porteur" label="Porteur" defaultValue={porteur ?? ""} required />
      <div className="flex items-start">
        <Button type="submit" size="md" loading={pending} className="h-12 w-full">
          <Check className="h-4 w-4" /> Valider
        </Button>
      </div>
      {state?.error && (
        <Callout tone="danger" className="sm:col-span-2 lg:col-span-5">
          {state.error}
        </Callout>
      )}
    </form>
  );
}
