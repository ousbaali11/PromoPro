"use client";

import { useState, useTransition, useActionState } from "react";
import { markContacted, submitRetourClient, relancerCommercial } from "./actions";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Primitives";

export function ProspectRowActions({
  prospectId,
  statutContact,
}: {
  prospectId: string;
  statutContact: string;
}) {
  const [pending, startTransition] = useTransition();
  const [retourOpen, setRetourOpen] = useState(false);
  const [state, formAction, formPending] = useActionState(submitRetourClient, undefined);

  if (retourOpen) {
    return (
      <form action={formAction} className="w-56 space-y-2">
        <input type="hidden" name="prospectId" value={prospectId} />
        <Textarea name="retour" rows={2} placeholder="Conclusion de l'échange..." required />
        {state?.error && <p className="text-xs text-rose-700">{state.error}</p>}
        <Button type="submit" size="sm" variant="gold" disabled={formPending}>
          {formPending ? "Envoi..." : "Enregistrer"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      {statutContact === "NON_CONTACTE" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => startTransition(() => markContacted(prospectId))}
        >
          Contacté
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setRetourOpen(true)}>
        Retour client
      </Button>
    </div>
  );
}

export function RelancerButton({ commercialId }: { commercialId: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending || sent}
      onClick={() =>
        startTransition(async () => {
          await relancerCommercial(commercialId);
          setSent(true);
        })
      }
    >
      {sent ? "Relancé" : "Relancer"}
    </Button>
  );
}
