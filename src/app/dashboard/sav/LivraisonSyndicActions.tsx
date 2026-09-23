"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { PackageCheck, BellPlus } from "lucide-react";
import { confirmerLivraisonSav, definirSyndic } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input, Select, Callout } from "@/components/ui/Primitives";

export function ConfirmerLivraisonButton({ bienId }: { bienId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await confirmerLivraisonSav(bienId);
            setError(res?.error ?? null);
          })
        }
      >
        <PackageCheck className="h-4 w-4" /> Confirmer tout — livré
      </Button>
      {error && <p className="text-caption text-danger-fg">{error}</p>}
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
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-3 rounded-md bg-navy-50 p-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="form-syndic">
      <Select id="syndic-bien" name="bienId" label="Bien / client" required>
        {biens.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </Select>
      <Input id="syndic-montant" name="montant" type="number" label="Montant (MAD)" min={1} step={1} clearable={false} required />
      <Select id="syndic-periode" name="periode" label="Période" defaultValue="2 ans">
        <option value="2 ans">Global 2 ans</option>
        <option value="Annuel">Annuel</option>
      </Select>
      <Button type="submit" loading={pending} className="h-12 w-full">
        <BellPlus className="h-4 w-4" /> Définir et notifier le client
      </Button>
      {state?.error && (
        <Callout tone="danger" className="sm:col-span-2 lg:col-span-4">
          {state.error}
        </Callout>
      )}
      {state && !state.error && (
        <Callout tone="success" className="sm:col-span-2 lg:col-span-4">
          Montant enregistré, client notifié.
        </Callout>
      )}
    </form>
  );
}
