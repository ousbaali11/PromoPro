"use client";

import { useState, useTransition, useActionState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X, MessageSquareText } from "lucide-react";
import { acceptProposition, refuseProposition, negotiateProposition } from "./actions";
import { Button } from "@/components/ui/Button";
import { Textarea, Callout } from "@/components/ui/Primitives";

export function PropositionActions({ propositionId }: { propositionId: string }) {
  const [pending, startTransition] = useTransition();
  const [enCours, setEnCours] = useState<"accept" | "refuse" | null>(null);
  const [negoOpen, setNegoOpen] = useState(false);
  const [state, formAction, negoPending] = useActionState(negotiateProposition, undefined);

  const lancer = (action: "accept" | "refuse") => {
    setEnCours(action);
    startTransition(() => (action === "accept" ? acceptProposition(propositionId) : refuseProposition(propositionId)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} loading={pending && enCours === "accept"} onClick={() => lancer("accept")}>
          <Check className="h-4 w-4" /> Accepter
        </Button>
        <Button size="sm" variant="danger" disabled={pending} loading={pending && enCours === "refuse"} onClick={() => lancer("refuse")}>
          <X className="h-4 w-4" /> Refuser
        </Button>
        <Button size="sm" variant="secondary" aria-expanded={negoOpen} onClick={() => setNegoOpen((v) => !v)}>
          <MessageSquareText className="h-4 w-4" /> Négocier
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {negoOpen && (
          <motion.form
            action={formAction}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-md bg-navy-50 p-3">
              <input type="hidden" name="propositionId" value={propositionId} />
              <Textarea
                name="note"
                rows={2}
                label="Votre contre-proposition"
                hint="Pourcentages, dates, conditions…"
                error={state?.error}
                required
              />
              <Button type="submit" size="sm" variant="gold" loading={negoPending}>
                Envoyer la contre-proposition
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
