"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { CalendarCheck, FileDown, DoorOpen } from "lucide-react";
import { demanderVisite, choisirCreneauVisite } from "./actions";
import { Button } from "@/components/ui/Button";
import { Badge, Field, Input, Select } from "@/components/ui/Primitives";

type Visite = {
  id: string;
  statut: string;
  dateVisite: string | null;
  autorisationUrl: string | null;
  motifRefus: string | null;
};

function heuresPour(dateStr: string) {
  if (!dateStr) return [];
  const jour = new Date(`${dateStr}T00:00`).getDay();
  if (jour === 0) return [];
  const plages = jour === 6 ? [[8, 12]] : [[8, 12], [14, 18]];
  const out: string[] = [];
  for (const [d, f] of plages) for (let t = d * 60; t + 30 <= f * 60; t += 30) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  return out;
}

/** Section 11.7 côté client : demande → autorisation → choix du créneau. */
export function VisiteSection({ bienId, visite }: { bienId: string; visite: Visite | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const demander = (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await demanderVisite(bienId);
          setError(res?.error ?? null);
        })
      }
    >
      <DoorOpen className="h-4 w-4" /> {pending ? "Envoi..." : "Demander une visite"}
    </Button>
  );

  if (!visite || visite.statut === "REFUSEE") {
    return (
      <div className="space-y-2">
        {visite?.statut === "REFUSEE" && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            Votre dernière demande a été refusée{visite.motifRefus ? ` : ${visite.motifRefus}` : "."} Vous pouvez en
            formuler une nouvelle.
          </p>
        )}
        {demander}
        {error && <p className="text-xs text-rose-700">{error}</p>}
      </div>
    );
  }

  if (visite.statut === "DEMANDEE") {
    return <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">Demande de visite en attente du SAV</Badge>;
  }

  if (visite.statut === "PLANIFIEE") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
          <CalendarCheck className="mr-1 h-3.5 w-3.5" />
          Visite le{" "}
          {visite.dateVisite &&
            new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(new Date(visite.dateVisite))}
        </Badge>
        {visite.autorisationUrl && (
          <a href={visite.autorisationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline">
            <FileDown className="h-3.5 w-3.5" /> Autorisation de visite
          </a>
        )}
      </div>
    );
  }

  // ACCEPTEE : autorisation disponible, créneau à choisir
  return <ChoixCreneau visite={visite} />;
}

function ChoixCreneau({ visite }: { visite: Visite }) {
  const action = choisirCreneauVisite.bind(null, visite.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [date, setDate] = useState("");
  const heures = useMemo(() => heuresPour(date), [date]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3 rounded-md bg-gold-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-navy-900">Visite acceptée — choisissez votre créneau</p>
        {visite.autorisationUrl && (
          <a href={visite.autorisationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline">
            <FileDown className="h-3.5 w-3.5" /> Autorisation de visite
          </a>
        )}
      </div>
      <p className="text-xs text-navy-400">Lundi–vendredi 8h–12h et 14h–18h, samedi 8h–12h.</p>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Field label="Date" htmlFor="visite-date">
          <Input id="visite-date" name="date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Heure" htmlFor="visite-heure">
          <Select id="visite-heure" name="heure" required disabled={heures.length === 0}>
            {heures.length === 0 ? (
              <option value="">{date ? "Pas de visite ce jour" : "Choisissez une date"}</option>
            ) : (
              heures.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))
            )}
          </Select>
        </Field>
        <Button type="submit" size="sm" variant="gold" disabled={pending || heures.length === 0}>
          {pending ? "..." : "Confirmer le créneau"}
        </Button>
        {state?.error && <p className="w-full text-xs text-rose-700">{state.error}</p>}
      </form>
    </div>
  );
}
