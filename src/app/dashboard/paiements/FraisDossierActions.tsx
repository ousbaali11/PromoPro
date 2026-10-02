"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Check, FileBadge, Pencil } from "lucide-react";
import { definirFraisDossierAction, validerFraisDossierAction, type DefinirFraisDossierState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Callout, Input } from "@/components/ui/Primitives";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";
import { useHydrated } from "@/components/ui/useHydrated";

/**
 * Frais de dossier (Comptable Interne, fiche client, onglet Échéancier &
 * Paiements) : définition ou modification du montant tant que le client n'a
 * pas déclaré son paiement, puis validation du paiement déclaré (reçu PDF).
 */
export function DefinirFraisDossierForm({ bienId, montantActuel }: { bienId: string; montantActuel: number | null }) {
  const [state, formAction, pending] = useActionState<DefinirFraisDossierState, FormData>(definirFraisDossierAction, undefined);
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const modification = montantActuel !== null;
  return (
    <form ref={formRef} action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-3" data-testid="form-frais-dossier" data-hydrated={hydrated ? "true" : undefined}>
      <input type="hidden" name="bienId" value={bienId} />
      <div className="flex flex-wrap items-end gap-3">
        <Input
          id="frais-dossier-montant"
          name="montant"
          type="number"
          min={1}
          step={1}
          label={modification ? "Nouveau montant des frais de dossier (MAD)" : "Montant des frais de dossier (MAD)"}
          defaultValue={montantActuel ?? ""}
          clearable={false}
          required
          containerClassName="w-64"
        />
        <Button type="submit" size="sm" variant={modification ? "secondary" : "gold"} loading={pending} data-testid="definir-frais-dossier">
          {modification ? <Pencil className="h-4 w-4" /> : <FileBadge className="h-4 w-4" />} {modification ? "Modifier le montant et notifier le client" : "Définir et notifier le client"}
        </Button>
      </div>
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      {state && !state.error && (
        <Callout tone="success" testId="frais-dossier-enregistre">
          {state.modification ? "Montant modifié, client notifié." : "Montant enregistré, client notifié."}
        </Callout>
      )}
    </form>
  );
}

export function ValiderFraisDossierButton({ fraisId }: { fraisId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await validerFraisDossierAction(fraisId);
            setError(res?.error ?? null);
          })
        }
        data-testid="valider-frais-dossier"
      >
        <Check className="h-4 w-4" /> Valider les frais de dossier
      </Button>
      {error && <p className="text-caption text-danger-fg">{error}</p>}
    </div>
  );
}
