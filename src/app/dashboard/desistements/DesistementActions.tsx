"use client";

import { useActionState, useState, useTransition } from "react";
import { BadgeCheck, HandCoins } from "lucide-react";
import { verifierDesistement, marquerRembourse } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input, Callout } from "@/components/ui/Primitives";

export function VerifierButton({ desistementId }: { desistementId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await verifierDesistement(desistementId);
            setError(res?.error ?? null);
          })
        }
      >
        <BadgeCheck className="h-4 w-4" /> Papiers vérifiés
      </Button>
      {error && <p className="text-caption text-danger-fg">{error}</p>}
    </div>
  );
}

export function RembourserForm({ desistementId }: { desistementId: string }) {
  const action = marquerRembourse.bind(null, desistementId);
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-start gap-3 rounded-md bg-navy-50 p-3" data-testid="form-rembourser">
      <Input
        id={`decharge-${desistementId}`}
        name="dechargeNote"
        label="Décharge"
        hint="Indiquez si une décharge signée par le payeur a été fournie (ex. fournie le 12/10/2026)."
        containerClassName="min-w-64 flex-1"
      />
      <Button type="submit" variant="gold" loading={pending} className="h-12">
        <HandCoins className="h-4 w-4" /> Marquer remboursé
      </Button>
      {state?.error && (
        <Callout tone="danger" className="w-full">
          {state.error}
        </Callout>
      )}
    </form>
  );
}
