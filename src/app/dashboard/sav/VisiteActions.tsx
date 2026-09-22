"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { accepterVisite, refuserVisite } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Primitives";

export function VisiteActions({ visiteId }: { visiteId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const refuser = refuserVisite.bind(null, visiteId);
  const [state, formAction, formPending] = useActionState(refuser, undefined);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await accepterVisite(visiteId);
              setError(res?.error ?? null);
            })
          }
        >
          <Check className="h-4 w-4" /> {pending ? "..." : "Accepter"}
        </Button>
        <Button size="sm" variant="danger" onClick={() => setOpen((v) => !v)}>
          <X className="h-4 w-4" /> Refuser
        </Button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {open && (
        <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md bg-navy-50 p-3">
          <Input name="motif" placeholder="Motif (facultatif)" className="w-64" />
          <Button type="submit" size="sm" variant="danger" disabled={formPending}>
            {formPending ? "..." : "Confirmer le refus"}
          </Button>
          {state?.error && <p className="w-full text-xs text-rose-700">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
