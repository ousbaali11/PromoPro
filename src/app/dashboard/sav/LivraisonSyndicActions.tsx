"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { PackageCheck } from "lucide-react";
import { confirmerLivraisonSav, definirSyndic } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Primitives";

export function ConfirmerLivraisonButton({ bienId }: { bienId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await confirmerLivraisonSav(bienId);
            setError(res?.error ?? null);
          })
        }
      >
        <PackageCheck className="h-4 w-4" /> {pending ? "..." : "Confirmer tout — livré"}
      </Button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

export function DefinirSyndicForm({ biens }: { biens: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(definirSyndic, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && !state.error) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-3 rounded-md bg-navy-50 p-3 sm:grid-cols-4">
      <Field label="Bien / client" htmlFor="syndic-bien">
        <Select id="syndic-bien" name="bienId" required>
          {biens.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Montant (MAD)" htmlFor="syndic-montant">
        <Input id="syndic-montant" name="montant" type="number" min={1} step={1} required />
      </Field>
      <Field label="Période" htmlFor="syndic-periode">
        <Select id="syndic-periode" name="periode" defaultValue="2 ans">
          <option value="2 ans">Global 2 ans</option>
          <option value="Annuel">Annuel</option>
        </Select>
      </Field>
      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? "..." : "Définir et notifier le client"}
        </Button>
      </div>
      {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:col-span-4">{state.error}</p>}
      {state && !state.error && <p className="text-xs text-emerald-700 sm:col-span-4">Montant enregistré, client notifié.</p>}
    </form>
  );
}
