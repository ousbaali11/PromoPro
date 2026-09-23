"use client";

import { useState, useTransition, useActionState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PhoneCall, MessageSquareText, BellRing, Check } from "lucide-react";
import { markContacted, submitRetourClient, relancerCommercial } from "./actions";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Primitives";

export function ProspectRowActions({
  prospectId,
  statutContact,
}: {
  prospectId: string;
  statutContact: string;
}) {
  const [pending, startTransition] = useTransition();
  const [retourOpen, setRetourOpen] = useState(false);
  const [state, formAction, formPending] = useActionState(submitRetourClient, undefined);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {statutContact === "NON_CONTACTE" && (
          <Button size="sm" variant="secondary" loading={pending} onClick={() => startTransition(() => markContacted(prospectId))}>
            <PhoneCall className="h-4 w-4" /> Contacté
          </Button>
        )}
        <Button size="sm" variant="ghost" aria-expanded={retourOpen} onClick={() => setRetourOpen((v) => !v)}>
          <MessageSquareText className="h-4 w-4" /> Retour client
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {retourOpen && (
          <motion.form
            action={formAction}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="w-64 overflow-hidden text-left"
          >
            <div className="space-y-2 rounded-md bg-navy-50 p-3">
              <input type="hidden" name="prospectId" value={prospectId} />
              <Textarea name="retour" rows={2} label="Conclusion de l'échange" error={state?.error} required />
              <Button type="submit" size="sm" variant="gold" loading={formPending}>
                Enregistrer
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RelancerButton({ commercialId }: { commercialId: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  return (
    <Button
      size="sm"
      variant={sent ? "ghost" : "secondary"}
      loading={pending}
      disabled={sent}
      onClick={() =>
        startTransition(async () => {
          await relancerCommercial(commercialId);
          setSent(true);
        })
      }
    >
      {sent ? <Check className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
      {sent ? "Relancé" : "Relancer"}
    </Button>
  );
}
