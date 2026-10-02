"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileDown, Paperclip, Send } from "lucide-react";
import { payerFraisDossier } from "./actions";
import { Button } from "@/components/ui/Button";
import { Callout, Input, Select } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FileUpload } from "@/components/ui/FileUpload";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

const NATURES = [
  { value: "virement local", label: "Virement local" },
  { value: "virement international", label: "Virement international" },
  { value: "versement", label: "Versement" },
  { value: "cheque", label: "Chèque" },
];

const STATUT: Record<string, { label: string; tone: "success" | "info" | "warning" }> = {
  PAYE: { label: "Payé", tone: "success" },
  EN_ATTENTE_VALIDATION: { label: "En cours de validation", tone: "info" },
  A_PAYER: { label: "À payer", tone: "warning" },
};

/** Rubrique Frais de dossier côté client, sur le modèle du syndic : montant à payer, déclaration de paiement avec preuve, statut, reçu. */
export function FraisDossierCard({
  frais,
}: {
  frais: { id: string; montant: string; statut: string; preuveUrl: string | null; recuPdfUrl: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const action = payerFraisDossier.bind(null, frais?.id ?? "");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!frais) {
    return <p className="text-small text-navy-400">Le montant de vos frais de dossier sera communiqué par le service comptable.</p>;
  }
  const st = STATUT[frais.statut] ?? { label: frais.statut, tone: "warning" as const };
  const lien = "inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-price tabular text-navy-900" data-testid="frais-dossier-montant">
            {frais.montant}
          </p>
          <p className="text-caption text-navy-400">Frais de dossier</p>
        </div>
        <StatusBadge statut={frais.statut} label={st.label} tone={st.tone} />
      </div>
      <div className="flex flex-wrap gap-3">
        {frais.preuveUrl && (
          <a href={frais.preuveUrl} target="_blank" rel="noreferrer" className={lien}>
            <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
          </a>
        )}
        {frais.recuPdfUrl && (
          <a href={frais.recuPdfUrl} target="_blank" rel="noreferrer" className={lien} data-testid="recu-frais-dossier">
            <FileDown className="h-3.5 w-3.5" /> Reçu (PDF)
          </a>
        )}
      </div>
      {frais.statut === "A_PAYER" && !open && (
        <Button size="sm" variant="gold" onClick={() => setOpen(true)}>
          Déclarer mon paiement
        </Button>
      )}
      <AnimatePresence initial={false}>
        {frais.statut === "A_PAYER" && open && (
          <motion.form
            action={formAction}
            onSubmit={soumettreSansReinitialiser(formAction)}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-clip"
            data-testid="form-payer-frais-dossier"
          >
            <div className="space-y-3 rounded-md bg-navy-50 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select id="frais-nature" name="natureOperation" label="Nature de l'opération" defaultValue="virement local">
                  {NATURES.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </Select>
                <Input id="frais-banque" name="banque" label="Banque" required />
                <Input id="frais-date" name="dateOperation" type="date" label="Date de l'opération" clearable={false} required />
                <Input id="frais-porteur" name="porteur" label="Porteur" required />
              </div>
              <FileUpload name="preuveUrl" type="preuves-paiement" label="Preuve de paiement" required />
              {state?.error && <Callout tone="danger">{state.error}</Callout>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={pending}>
                  <Send className="h-4 w-4" /> Envoyer au service comptable
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
