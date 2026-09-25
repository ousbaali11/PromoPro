"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Input, Select, Callout } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";
import { useHydrated } from "@/components/ui/useHydrated";

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

/** Bloc de champ qui s'ouvre / se ferme en douceur (chèque, porteur différent). */
function Repli({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
          className="overflow-clip"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
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
  withReference = false,
}: {
  action: (prev: PaiementFormState, formData: FormData) => Promise<PaiementFormState>;
  bienId: string;
  echeances: EcheanceOption[];
  submitLabel?: string;
  intro?: string;
  /** Champ « Référence de l'opération » (saisie directe par le Recouvrement, sans étape comptable). */
  withReference?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // Plusieurs formulaires peuvent coexister sur une page (recouvrement) : identifiants uniques par instance
  const uid = useId();
  const id = (champ: string) => `${champ}-${uid}`;
  const [nature, setNature] = useState("virement local");
  const [porteurDifferent, setPorteurDifferent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  const ouvertes = echeances.filter((e) => e.statut !== "PAYEE");
  const defaultEcheance = ouvertes[0]?.id ?? "";

  if (state?.success) {
    return (
      <Callout tone="success" testId="paiement-succes">
        {state.success}
      </Callout>
    );
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-4" data-testid="form-paiement" data-hydrated={hydrated ? "true" : undefined}>
      <input type="hidden" name="bienId" value={bienId} />
      {intro && <p className="text-caption text-navy-400">{intro}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select id={id("echeanceId")} name="echeanceId" label="Tranche concernée" defaultValue={defaultEcheance}>
          {echeances.length === 0 && <option value="">Échéancier non disponible</option>}
          {echeances.map((e) => (
            <option key={e.id} value={e.id} disabled={e.statut === "PAYEE"}>
              Tranche {e.numero} · {e.pourcentage}% · {fmt(e.montant)} MAD
              {e.statut === "PAYEE" ? " (payée)" : e.montantPaye > 0 ? ` (reste ${fmt(e.montant - e.montantPaye)})` : ""}
            </option>
          ))}
        </Select>
        <Select id={id("natureOperation")} name="natureOperation" label="Nature de l'opération" value={nature} onChange={(e) => setNature(e.target.value)}>
          {NATURES.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </Select>
        <Input id={id("banque")} name="banque" label="Banque" required />
        <Input id={id("dateOperation")} name="dateOperation" type="date" label="Date de l'opération" clearable={false} required />
        <Input id={id("montant")} name="montant" type="number" label="Montant" min={1} step={1} clearable={false} required />
        <Select id={id("devise")} name="devise" label="Devise" defaultValue="MAD">
          <option>MAD</option>
          <option>EUR</option>
          <option>USD</option>
        </Select>
        <Input
          id={id("porteur")}
          name="porteur"
          label="Porteur de l'opération"
          hint="Personne physique ayant réalisé le paiement."
          containerClassName={withReference ? undefined : "sm:col-span-2"}
          required
        />
        {withReference && <Input id={id("reference")} name="reference" label="Référence de l'opération" hint="ex. VIR-2026-00123" required />}
      </div>

      <Repli visible={nature === "cheque"}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            id={id("dateEncaissementCheque")}
            name="dateEncaissementCheque"
            type="date"
            label="Date d'encaissement prévue"
            hint="Le chèque apparaîtra en trésorerie à cette date."
            clearable={false}
            required={nature === "cheque"}
          />
        </div>
      </Repli>

      <FileUpload name="preuveUrl" type="preuves-paiement" label="Preuve de paiement" required />

      <label className="flex cursor-pointer items-center gap-2 text-small text-navy-400">
        <input
          type="checkbox"
          checked={porteurDifferent}
          onChange={(e) => setPorteurDifferent(e.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        Le porteur n&apos;est pas le client (joindre sa pièce d&apos;identité)
      </label>
      <Repli visible={porteurDifferent}>
        <FileUpload name="porteurPieceUrl" type="pieces-identite" label="Pièce d'identité du porteur" required={porteurDifferent} />
      </Repli>

      {state?.error && <Callout tone="danger">{state.error}</Callout>}

      <Button type="submit" loading={pending} variant="gold">
        {submitLabel}
      </Button>
    </form>
  );
}
