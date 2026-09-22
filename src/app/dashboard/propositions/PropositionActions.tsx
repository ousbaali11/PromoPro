"use client";

import { useState, useTransition, useActionState } from "react";
import { Check, X, MessageSquareText } from "lucide-react";
import { acceptProposition, refuseProposition, negotiateProposition } from "./actions";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Primitives";

export function PropositionActions({ propositionId }: { propositionId: string }) {
  const [pending, startTransition] = useTransition();
  const [negoOpen, setNegoOpen] = useState(false);
  const [state, formAction, negoPending] = useActionState(negotiateProposition, undefined);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => acceptProposition(propositionId))}
        >
          <Check className="h-4 w-4" /> Accepter
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => startTransition(() => refuseProposition(propositionId))}
        >
          <X className="h-4 w-4" /> Refuser
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setNegoOpen((v) => !v)}>
          <MessageSquareText className="h-4 w-4" /> Négocier
        </Button>
      </div>

      {negoOpen && (
        <form action={formAction} className="space-y-2 rounded-md bg-navy-50 p-3">
          <input type="hidden" name="propositionId" value={propositionId} />
          <Textarea
            name="note"
            rows={2}
            placeholder="Votre contre-proposition (pourcentages, dates...)"
            required
          />
          {state?.error && <p className="text-xs text-rose-700">{state.error}</p>}
          <Button type="submit" size="sm" variant="gold" disabled={negoPending}>
            {negoPending ? "Envoi..." : "Envoyer la contre-proposition"}
          </Button>
        </form>
      )}
    </div>
  );
}
