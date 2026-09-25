"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import { accepterVisite, refuserVisite } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input, Callout } from "@/components/ui/Primitives";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

export function VisiteActions({ visiteId }: { visiteId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const refuser = refuserVisite.bind(null, visiteId);
  const [state, formAction, formPending] = useActionState(refuser, undefined);

  return (
    <div className="space-y-2 text-left">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await accepterVisite(visiteId);
              setError(res?.error ?? null);
            })
          }
        >
          <Check className="h-4 w-4" /> Accepter
        </Button>
        <Button size="sm" variant="danger" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <X className="h-4 w-4" /> Refuser
        </Button>
      </div>
      {error && <p className="text-caption text-danger-fg">{error}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            action={formAction} onSubmit={soumettreSansReinitialiser(formAction)}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-clip"
          >
            <div className="flex flex-wrap items-start gap-2 rounded-md bg-navy-50 p-3">
              <Input name="motif" label="Motif (facultatif)" containerClassName="w-64" />
              <Button type="submit" variant="danger" loading={formPending} className="h-12">
                Confirmer le refus
              </Button>
              {state?.error && (
                <Callout tone="danger" className="w-full">
                  {state.error}
                </Callout>
              )}
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
