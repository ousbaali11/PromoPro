"use client";

import { useActionState, useState, useTransition } from "react";
import { verifierDesistement, marquerRembourse } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Primitives";

export function VerifierButton({ desistementId }: { desistementId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await verifierDesistement(desistementId);
            setError(res?.error ?? null);
          })
        }
      >
        {pending ? "..." : "Papiers vérifiés"}
      </Button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

export function RembourserForm({ desistementId }: { desistementId: string }) {
  const action = marquerRembourse.bind(null, desistementId);
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-md bg-navy-50 p-3">
      <div className="min-w-64 flex-1">
        <Field label="Décharge" htmlFor={`decharge-${desistementId}`} hint="Indiquez si une décharge signée par le payeur a été fournie.">
          <Input id={`decharge-${desistementId}`} name="dechargeNote" placeholder="ex. Décharge fournie le 12/10/2026" />
        </Field>
      </div>
      <Button type="submit" size="sm" variant="gold" disabled={pending}>
        {pending ? "..." : "Marquer remboursé"}
      </Button>
      {state?.error && <p className="w-full text-xs text-rose-700">{state.error}</p>}
    </form>
  );
}
