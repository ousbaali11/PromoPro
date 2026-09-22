"use client";

import { useActionState, useTransition } from "react";
import { blockBien, unblockBien } from "./actions";
import { Card, Field, Textarea } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

export function BlockBienForm({ bienId }: { bienId: string }) {
  const [state, formAction, pending] = useActionState(blockBien, undefined);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-medium text-navy-900">Bloquer ce bien</h2>
      <p className="mb-3 text-xs text-navy-400">
        Le bien sera retiré de la vente pour tous les commerciaux. Votre commentaire reste privé.
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="bienId" value={bienId} />
        <Field label="Commentaire (visible par vous seul)" htmlFor="commentaire">
          <Textarea id="commentaire" name="commentaire" rows={2} placeholder="ex. Réservé pour un partenaire..." />
        </Field>
        {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Blocage..." : "Bloquer ce bien"}
        </Button>
      </form>
    </Card>
  );
}

export function UnblockBienButton({ bienId }: { bienId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => unblockBien(bienId))}
    >
      {pending ? "Déblocage..." : "Débloquer ce bien"}
    </Button>
  );
}
