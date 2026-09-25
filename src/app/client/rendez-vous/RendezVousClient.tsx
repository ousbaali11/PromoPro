"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CalendarClock, Send } from "lucide-react";
import { proposerRendezVous, accepterPropositionService, reproposerClient } from "./actions";
import { Button } from "@/components/ui/Button";
import { Callout, Input, Select, Textarea } from "@/components/ui/Primitives";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

const SERVICES = [
  { value: "COMMERCIAL", label: "Service commercial (votre commercial)" },
  { value: "SAV", label: "Service après-vente" },
  { value: "ADMINISTRATIF", label: "Service administratif" },
  { value: "RECOUVREMENT", label: "Service recouvrement" },
];

export function NouveauRendezVousForm({ biens }: { biens: { id: string; designation: string }[] }) {
  const [state, formAction, pending] = useActionState(proposerRendezVous, undefined);

  if (state?.success) {
    return (
      <Callout tone="success" testId="rdv-succes">
        {state.success}
      </Callout>
    );
  }

  return (
    <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-4" data-testid="form-rendez-vous">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select id="service" name="service" label="Service" defaultValue="COMMERCIAL">
          {SERVICES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select id="bienId" name="bienId" label="Bien concerné" defaultValue={biens[0]?.id ?? ""}>
          {biens.map((b) => (
            <option key={b.id} value={b.id}>
              {b.designation}
            </option>
          ))}
          {biens.length === 0 && <option value="">—</option>}
        </Select>
        <Input id="date" name="date" type="datetime-local" label="Date et heure souhaitées" clearable={false} required />
        <Textarea id="notes" name="notes" rows={1} label="Objet (facultatif)" hint="ex. Signature des copies du contrat" />
      </div>
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <Button type="submit" variant="gold" loading={pending}>
        <Send className="h-4 w-4" /> Proposer ce rendez-vous
      </Button>
    </form>
  );
}

export function ReponseClient({ rdvId }: { rdvId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const reproposer = reproposerClient.bind(null, rdvId);
  const [state, formAction, formPending] = useActionState(reproposer, undefined);

  return (
    <div className="space-y-2 text-left">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await accepterPropositionService(rdvId);
              setError(res?.error ?? null);
            })
          }
        >
          <Check className="h-4 w-4" /> Accepter
        </Button>
        <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <CalendarClock className="h-4 w-4" /> Proposer une autre date
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
              <Input id={`date-${rdvId}`} name="date" type="datetime-local" label="Nouvelle date et heure" containerClassName="w-56" clearable={false} required />
              <Button type="submit" variant="gold" loading={formPending} className="h-12">
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
