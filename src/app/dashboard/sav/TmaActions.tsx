"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileSignature, Play, CheckCircle2, X } from "lucide-react";
import { chiffrerTma, refuserTma, avancerTma } from "./actions";
import { Button } from "@/components/ui/Button";
import { Callout, Input } from "@/components/ui/Primitives";
import { FileUpload } from "@/components/ui/FileUpload";

/** Chiffrage d'une demande (montant + devis PDF) et refus motivé, côté SAV. */
export function ChiffrageTma({ demandeId }: { demandeId: string }) {
  const [mode, setMode] = useState<"repos" | "chiffrer" | "refuser">("repos");
  const [state, formAction, pending] = useActionState(chiffrerTma, undefined);
  const [refus, refusAction, refusPending] = useActionState(refuserTma, undefined);

  if (state?.success || refus?.success) {
    return <Callout tone="success">{state?.success ?? refus?.success}</Callout>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setMode(mode === "chiffrer" ? "repos" : "chiffrer")} aria-expanded={mode === "chiffrer"} data-testid="tma-chiffrer">
          <FileSignature className="h-4 w-4" /> Chiffrer et envoyer le devis
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMode(mode === "refuser" ? "repos" : "refuser")} aria-expanded={mode === "refuser"}>
          <X className="h-4 w-4" /> Refuser
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {mode === "chiffrer" && (
          <motion.form
            action={formAction}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-hidden"
            data-testid="form-chiffrage"
          >
            <div className="space-y-3 rounded-md bg-navy-50 p-3">
              <input type="hidden" name="demandeId" value={demandeId} />
              <Input name="montant" type="number" min={1} step={1} label="Montant du devis (MAD)" clearable={false} required containerClassName="max-w-xs" />
              <FileUpload name="devisUrl" type="tma-devis" label="Devis (PDF)" accept=".pdf" required />
              {state?.error && <Callout tone="danger">{state.error}</Callout>}
              <Button type="submit" size="sm" loading={pending}>
                Envoyer le devis au client
              </Button>
            </div>
          </motion.form>
        )}
        {mode === "refuser" && (
          <motion.form
            action={refusAction}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-md bg-navy-50 p-3">
              <input type="hidden" name="demandeId" value={demandeId} />
              <Input name="motif" label="Motif du refus (transmis au client)" required />
              {refus?.error && <Callout tone="danger">{refus.error}</Callout>}
              <Button type="submit" size="sm" variant="danger" loading={refusPending}>
                Confirmer le refus
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Suivi des travaux : Démarrer (SIGNE → EN_COURS) puis Terminer (EN_COURS → TERMINE). */
export function AvancementTma({ demandeId, statut }: { demandeId: string; statut: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const libelle = statut === "SIGNE" ? "Démarrer les travaux" : statut === "EN_COURS" ? "Travaux terminés" : null;
  if (!libelle) return null;
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={statut === "SIGNE" ? "primary" : "secondary"}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await avancerTma(demandeId);
            setError(res?.error ?? null);
          })
        }
        data-testid="tma-avancer"
      >
        {statut === "SIGNE" ? <Play className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} {libelle}
      </Button>
      {error && <p className="text-caption text-danger-fg">{error}</p>}
    </div>
  );
}
