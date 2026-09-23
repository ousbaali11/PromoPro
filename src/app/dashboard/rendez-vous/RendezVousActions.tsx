"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CalendarClock, Send } from "lucide-react";
import { accepterRendezVous, reproposerRendezVous } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input, Callout } from "@/components/ui/Primitives";

export function RendezVousActions({ rdvId }: { rdvId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const reproposer = reproposerRendezVous.bind(null, rdvId);
  const [state, formAction, formPending] = useActionState(reproposer, undefined);

  return (
    <div className="space-y-2 text-left">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await accepterRendezVous(rdvId);
              setError(res?.error ?? null);
            })
          }
        >
          <Check className="h-4 w-4" /> Accepter
        </Button>
        <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <CalendarClock className="h-4 w-4" /> Reproposer
        </Button>
      </div>
      {error && <p className="text-caption text-danger-fg">{error}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            action={formAction}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-start gap-2 rounded-md bg-navy-50 p-3">
              <Input id={`date-${rdvId}`} name="date" type="datetime-local" label="Nouvelle date et heure" containerClassName="w-56" clearable={false} required />
              <Input id={`notes-${rdvId}`} name="notes" label="Message (facultatif)" containerClassName="w-64" />
              <Button type="submit" size="md" variant="gold" loading={formPending} className="h-12">
                <Send className="h-4 w-4" /> Envoyer
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
