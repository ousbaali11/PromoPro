"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, CalendarClock } from "lucide-react";
import { accepterRendezVous, reproposerRendezVous } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Primitives";

export function RendezVousActions({ rdvId }: { rdvId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const reproposer = reproposerRendezVous.bind(null, rdvId);
  const [state, formAction, formPending] = useActionState(reproposer, undefined);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await accepterRendezVous(rdvId);
              setError(res?.error ?? null);
            })
          }
        >
          <Check className="h-4 w-4" /> Accepter
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <CalendarClock className="h-4 w-4" /> Reproposer
        </Button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {open && (
        <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-md bg-navy-50 p-3">
          <Field label="Nouvelle date et heure" htmlFor={`date-${rdvId}`}>
            <Input id={`date-${rdvId}`} name="date" type="datetime-local" required />
          </Field>
          <Field label="Message (facultatif)" htmlFor={`notes-${rdvId}`}>
            <Input id={`notes-${rdvId}`} name="notes" placeholder="ex. Créneau du matin indisponible" />
          </Field>
          <Button type="submit" size="sm" variant="gold" disabled={formPending}>
            {formPending ? "..." : "Envoyer"}
          </Button>
          {state?.error && <p className="w-full text-xs text-rose-700">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
