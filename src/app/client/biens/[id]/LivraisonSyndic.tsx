"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PackageCheck, Check, Paperclip, Send } from "lucide-react";
import { confirmerLivraisonClient, payerSyndic } from "./actions";
import { Button } from "@/components/ui/Button";
import { Badge, Callout, Input, Select } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FileUpload } from "@/components/ui/FileUpload";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

/** 11.10 — bouton « Confirmer tout » côté client + état des deux confirmations. */
export function LivraisonCard({
  bienId,
  statut,
  confirmeeClient,
  confirmeeSav,
  livreLe,
}: {
  bienId: string;
  statut: string;
  confirmeeClient: boolean;
  confirmeeSav: boolean;
  livreLe: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (statut === "LIVRE") {
    return (
      <Callout tone="success" icon={<PackageCheck />}>
        Bien livré{livreLe && ` le ${livreLe}`} — dossier transmis au notaire.
      </Callout>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge tone={confirmeeClient ? "success" : "neutral"}>
          {confirmeeClient ? <Check className="h-3 w-3" /> : null} Vous
        </Badge>
        <Badge tone={confirmeeSav ? "success" : "neutral"}>
          {confirmeeSav ? <Check className="h-3 w-3" /> : null} Service après-vente
        </Badge>
      </div>
      {confirmeeClient ? (
        <Callout tone="info">Votre confirmation est enregistrée ; en attente de celle du Service Après-Vente.</Callout>
      ) : (
        <>
          <p className="text-caption text-navy-400">
            À la remise des clés, confirmez la bonne réception de votre bien. Une fois le Service Après-Vente
            également confirmé, le dossier sera transmis au notaire.
          </p>
          <Button
            size="sm"
            variant="gold"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await confirmerLivraisonClient(bienId);
                setError(res?.error ?? null);
              })
            }
          >
            <PackageCheck className="h-4 w-4" /> Confirmer tout — bien reçu
          </Button>
        </>
      )}
      {error && <p className="text-caption text-danger-fg">{error}</p>}
    </div>
  );
}

const NATURES = [
  { value: "virement local", label: "Virement local" },
  { value: "virement international", label: "Virement international" },
  { value: "versement", label: "Versement" },
  { value: "cheque", label: "Chèque" },
];

const SYNDIC_STATUT: Record<string, { label: string; tone: "success" | "info" | "warning" }> = {
  PAYE: { label: "Payé", tone: "success" },
  EN_ATTENTE_VALIDATION: { label: "En cours de validation", tone: "info" },
  A_PAYER: { label: "À payer", tone: "warning" },
};

/** 12.2 — rubrique Syndic côté client : montant à payer, déclaration de paiement, statut. */
export function SyndicCard({
  syndic,
}: {
  syndic: { id: string; montant: string; periode: string | null; statut: string; preuveUrl: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const action = payerSyndic.bind(null, syndic?.id ?? "");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!syndic) {
    return <p className="text-small text-navy-400">Le montant de votre part de syndic sera communiqué par le Service Après-Vente.</p>;
  }
  const st = SYNDIC_STATUT[syndic.statut] ?? { label: syndic.statut, tone: "warning" as const };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-price tabular text-navy-900">{syndic.montant}</p>
          <p className="text-caption text-navy-400">{syndic.periode ?? "Syndic obligatoire"}</p>
        </div>
        <StatusBadge statut={syndic.statut} label={st.label} tone={st.tone} />
      </div>
      {syndic.preuveUrl && (
        <a
          href={syndic.preuveUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
        </a>
      )}
      {syndic.statut === "A_PAYER" && !open && (
        <Button size="sm" variant="gold" onClick={() => setOpen(true)}>
          Déclarer mon paiement
        </Button>
      )}
      <AnimatePresence initial={false}>
        {syndic.statut === "A_PAYER" && open && (
          <motion.form
            action={formAction} onSubmit={soumettreSansReinitialiser(formAction)}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-clip"
          >
            <div className="space-y-3 rounded-md bg-navy-50 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select id="syndic-nature" name="natureOperation" label="Nature de l'opération" defaultValue="virement local">
                  {NATURES.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </Select>
                <Input id="syndic-banque" name="banque" label="Banque" required />
                <Input id="syndic-date" name="dateOperation" type="date" label="Date de l'opération" clearable={false} required />
                <Input id="syndic-porteur" name="porteur" label="Porteur" required />
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
