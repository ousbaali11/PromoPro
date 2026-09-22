"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, Input, Select } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";

export type PaiementFormState = { error?: string; success?: string } | undefined;

type EcheanceOption = { id: string; numero: number; pourcentage: number; montant: number; montantPaye: number; statut: string };

const NATURES = [
  { value: "virement local", label: "Virement local" },
  { value: "virement international", label: "Virement international" },
  { value: "versement", label: "Versement" },
  { value: "cheque", label: "Chèque" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Formulaire de saisie d'un paiement (section 6.8) — réutilisé par le
 * commercial (1ère tranche), le client (tranches suivantes, 11.8) et le
 * recouvrement (13.3). L'action serveur est passée en prop.
 */
export function PaiementForm({
  action,
  bienId,
  echeances,
  submitLabel = "Enregistrer le paiement",
  intro,
}: {
  action: (prev: PaiementFormState, formData: FormData) => Promise<PaiementFormState>;
  bienId: string;
  echeances: EcheanceOption[];
  submitLabel?: string;
  intro?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [nature, setNature] = useState("virement local");
  const [porteurDifferent, setPorteurDifferent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  const ouvertes = echeances.filter((e) => e.statut !== "PAYEE");
  const defaultEcheance = ouvertes[0]?.id ?? "";

  if (state?.success) {
    return (
      <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="bienId" value={bienId} />
      {intro && <p className="text-xs text-navy-400">{intro}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tranche concernée" htmlFor="echeanceId">
          <Select id="echeanceId" name="echeanceId" defaultValue={defaultEcheance}>
            {echeances.length === 0 && <option value="">Échéancier non disponible</option>}
            {echeances.map((e) => (
              <option key={e.id} value={e.id} disabled={e.statut === "PAYEE"}>
                Tranche {e.numero} · {e.pourcentage}% · {fmt(e.montant)} MAD
                {e.statut === "PAYEE" ? " (payée)" : e.montantPaye > 0 ? ` (reste ${fmt(e.montant - e.montantPaye)})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nature de l'opération" htmlFor="natureOperation">
          <Select
            id="natureOperation"
            name="natureOperation"
            value={nature}
            onChange={(e) => setNature(e.target.value)}
          >
            {NATURES.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </Select>
        </Field>
        {nature === "cheque" && (
          <Field label="Date d'encaissement prévue" htmlFor="dateEncaissementCheque">
            <Input id="dateEncaissementCheque" name="dateEncaissementCheque" type="date" required />
          </Field>
        )}
        <Field label="Banque" htmlFor="banque">
          <Input id="banque" name="banque" placeholder="ex. Attijariwafa Bank" required />
        </Field>
        <Field label="Date de l'opération" htmlFor="dateOperation">
          <Input id="dateOperation" name="dateOperation" type="date" required />
        </Field>
        <Field label="Montant" htmlFor="montant">
          <Input id="montant" name="montant" type="number" min={1} step={1} required />
        </Field>
        <Field label="Devise" htmlFor="devise">
          <Select id="devise" name="devise" defaultValue="MAD">
            <option>MAD</option>
            <option>EUR</option>
            <option>USD</option>
          </Select>
        </Field>
        <Field label="Porteur de l'opération" htmlFor="porteur" hint="Personne physique ayant réalisé le paiement.">
          <Input id="porteur" name="porteur" required />
        </Field>
      </div>

      <FileUpload name="preuveUrl" type="preuves-paiement" label="Preuve de paiement" required />

      <label className="flex items-center gap-2 text-xs text-navy-400">
        <input
          type="checkbox"
          checked={porteurDifferent}
          onChange={(e) => setPorteurDifferent(e.target.checked)}
          className="h-3.5 w-3.5 accent-gold"
        />
        Le porteur n&apos;est pas le client (joindre sa pièce d&apos;identité)
      </label>
      {porteurDifferent && (
        <FileUpload name="porteurPieceUrl" type="pieces-identite" label="Pièce d'identité du porteur" required />
      )}

      {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}

      <Button type="submit" disabled={pending} variant="gold">
        {pending ? "Enregistrement..." : submitLabel}
      </Button>
    </form>
  );
}
