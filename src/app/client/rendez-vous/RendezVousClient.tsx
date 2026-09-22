"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, CalendarClock } from "lucide-react";
import { proposerRendezVous, accepterPropositionService, reproposerClient } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Primitives";

const SERVICES = [
  { value: "COMMERCIAL", label: "Service commercial (votre commercial)" },
  { value: "SAV", label: "Service après-vente" },
  { value: "ADMINISTRATIF", label: "Service administratif" },
  { value: "RECOUVREMENT", label: "Service recouvrement" },
];

export function NouveauRendezVousForm({ biens }: { biens: { id: string; designation: string }[] }) {
  const [state, formAction, pending] = useActionState(proposerRendezVous, undefined);

  if (state?.success) {
    return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Service" htmlFor="service">
          <Select id="service" name="service" defaultValue="COMMERCIAL">
            {SERVICES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bien concerné" htmlFor="bienId">
          <Select id="bienId" name="bienId" defaultValue={biens[0]?.id ?? ""}>
            {biens.map((b) => (
              <option key={b.id} value={b.id}>
                {b.designation}
              </option>
            ))}
            {biens.length === 0 && <option value="">—</option>}
          </Select>
        </Field>
        <Field label="Date et heure souhaitées" htmlFor="date">
          <Input id="date" name="date" type="datetime-local" required />
        </Field>
        <Field label="Objet (facultatif)" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={1} placeholder="ex. Signature des copies du contrat" />
        </Field>
      </div>
      {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Envoi..." : "Proposer ce rendez-vous"}
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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await accepterPropositionService(rdvId);
              setError(res?.error ?? null);
            })
          }
        >
          <Check className="h-4 w-4" /> Accepter
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <CalendarClock className="h-4 w-4" /> Proposer une autre date
        </Button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {open && (
        <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-md bg-navy-50 p-3">
          <Field label="Nouvelle date et heure" htmlFor={`date-${rdvId}`}>
            <Input id={`date-${rdvId}`} name="date" type="datetime-local" required />
          </Field>
          <Button type="submit" size="sm" variant="gold" disabled={formPending}>
            {formPending ? "..." : "Envoyer"}
          </Button>
          {state?.error && <p className="w-full text-xs text-rose-700">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
