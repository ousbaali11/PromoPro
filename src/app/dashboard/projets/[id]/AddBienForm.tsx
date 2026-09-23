"use client";

import { useActionState, useRef, useEffect } from "react";
import { addBien } from "../actions";
import { Card, Field, Input, Select, Callout } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

export type ModeleBien = { source: string; nature: string; prix: number; surface: number };

/**
 * Ajout d'un bien au tableau de contenance. Avec `modele` (bouton « Dupliquer »
 * d'une fiche bien), nature, prix et surface sont pré-remplis et la désignation,
 * vidée, reçoit le focus : pratique pour saisir plusieurs lots similaires.
 */
export function AddBienForm({ projetId, modele }: { projetId: string; modele?: ModeleBien | null }) {
  const [state, formAction, pending] = useActionState(addBien, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && !state.error) formRef.current?.reset();
  }, [state]);

  return (
    <Card className="p-5" id="ajout-bien">
      <h2 className="mb-4 text-sm font-medium text-navy-900">Ajouter un bien au tableau de contenance</h2>
      {modele && (
        <Callout tone="info" className="mb-4" testId="duplication-bien">
          Copie de <strong>{modele.source}</strong> : nature, prix et surface repris — complétez la désignation du nouveau lot.
        </Callout>
      )}
      <form
        key={modele ? `dup-${modele.source}` : "vierge"}
        ref={formRef}
        action={formAction}
        data-testid="form-ajout-bien"
        data-duplication={modele ? "true" : undefined}
        className="grid grid-cols-1 gap-4 sm:grid-cols-4"
      >
        <input type="hidden" name="projetId" value={projetId} />
        <Field label="Désignation" htmlFor="designation">
          <Input id="designation" name="designation" placeholder="ex. Appartement C03" required autoFocus={!!modele} />
        </Field>
        <Field label="Nature" htmlFor="nature">
          <Select id="nature" name="nature" defaultValue={modele?.nature ?? "Appartement"}>
            <option>Appartement</option>
            <option>Parking</option>
            <option>Local commercial</option>
            <option>Villa</option>
          </Select>
        </Field>
        <Field label="Prix (MAD)" htmlFor="prix">
          <Input id="prix" name="prix" type="number" min={0} step={1000} required defaultValue={modele?.prix} />
        </Field>
        <Field label="Surface (m²)" htmlFor="surface">
          <Input id="surface" name="surface" type="number" min={0} step={0.5} required defaultValue={modele?.surface} />
        </Field>

        {state?.error && (
          <p className="sm:col-span-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
        )}

        <div className="sm:col-span-4">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Ajout..." : "Ajouter le bien"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
