"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useHydrated } from "@/components/ui/useHydrated";
import { CalendarCheck, FileDown, DoorOpen } from "lucide-react";
import { demanderVisite, choisirCreneauVisite } from "./actions";
import { Button } from "@/components/ui/Button";
import { Callout, Input, Select } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";
import { ymd } from "@/lib/echeancier";

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

const lienAutorisation =
  "inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus";

/** Section 11.7 côté client : demande → autorisation → choix du créneau. */
export function VisiteSection({ bienId, visite }: { bienId: string; visite: Visite | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const demander = (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await demanderVisite(bienId);
          setError(res?.error ?? null);
        })
      }
    >
      <DoorOpen className="h-4 w-4" /> Demander une visite
    </Button>
  );

  if (!visite || visite.statut === "REFUSEE") {
    return (
      <div className="space-y-3">
        {visite?.statut === "REFUSEE" && (
          <Callout tone="danger" role="status">
            Votre dernière demande a été refusée{visite.motifRefus ? ` : ${visite.motifRefus}` : "."} Vous pouvez en
            formuler une nouvelle.
          </Callout>
        )}
        {demander}
        {error && <p className="text-caption text-danger-fg">{error}</p>}
      </div>
    );
  }

  if (visite.statut === "DEMANDEE") {
    return <StatusBadge statut="DEMANDEE" label="Demande de visite en attente du SAV" tone="warning" />;
  }

  if (visite.statut === "PLANIFIEE") {
    return (
      <div className="space-y-3">
        <Callout tone="success" icon={<CalendarCheck />}>
          Visite le{" "}
          {visite.dateVisite &&
            new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(new Date(visite.dateVisite))}
        </Callout>
        {visite.autorisationUrl && (
          <a href={visite.autorisationUrl} target="_blank" rel="noreferrer" className={lienAutorisation}>
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
  const today = ymd(new Date()); // heure locale : toISOString() donnait la veille entre minuit et l'heure du décalage
  const hydrate = useHydrated(); // marqueur pour les tests : la date est un champ contrôlé, inutile avant hydratation

  return (
    <div className="space-y-3 rounded-md bg-gold-50 p-4 ring-1 ring-inset ring-gold-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small font-medium text-navy-900">Visite acceptée — choisissez votre créneau</p>
        {visite.autorisationUrl && (
          <a href={visite.autorisationUrl} target="_blank" rel="noreferrer" className={lienAutorisation}>
            <FileDown className="h-3.5 w-3.5" /> Autorisation de visite
          </a>
        )}
      </div>
      <p className="text-caption text-navy-400">Lundi–vendredi 8h–12h et 14h–18h, samedi 8h–12h.</p>
      <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start" data-testid="form-creneau" data-hydrated={hydrate ? "true" : undefined}>
        <Input id="visite-date" name="date" type="date" label="Date" min={today} value={date} onChange={(e) => setDate(e.target.value)} clearable={false} required />
        <Select id="visite-heure" name="heure" label="Heure" required disabled={heures.length === 0}>
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
        <Button type="submit" variant="gold" loading={pending} disabled={heures.length === 0} className="h-12">
          Confirmer le créneau
        </Button>
        {state?.error && (
          <Callout tone="danger" className="sm:col-span-3">
            {state.error}
          </Callout>
        )}
      </form>
    </div>
  );
}
