"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Send } from "lucide-react";
import { createProposition } from "../actions";
import { Card, Input, Select, Badge, Callout } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/utils";
import { useHydrated } from "@/components/ui/useHydrated";

type ClientRow = { id: string; nom: string; prenom: string; telephone1: string | null };

const DEFAULT_PCT = [40, 20, 20, 20];

export function NewPropositionForm({
  bienId,
  prix,
  clients,
  defaultDates,
}: {
  bienId: string;
  prix: number;
  clients: ClientRow[];
  defaultDates: string[];
}) {
  const [state, formAction, pending] = useActionState(createProposition, undefined);
  const [clientChoice, setClientChoice] = useState(clients[0]?.id ?? "__nouveau__");
  const [pct, setPct] = useState<number[]>(DEFAULT_PCT);
  const hydrated = useHydrated();
  const total = pct.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0);

  return (
    <form action={formAction} className="space-y-6" data-testid="form-nouvelle-proposition" data-hydrated={hydrated ? "true" : undefined}>
      <input type="hidden" name="bienId" value={bienId} />

      <Card className="p-5">
        <h2 className="mb-4 text-h3 text-navy-900">Client</h2>
        <Select id="clientId" name="clientId" label="Sélectionner un client" value={clientChoice} onChange={(e) => setClientChoice(e.target.value)}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.prenom} {c.nom} {c.telephone1 ? `· ${c.telephone1}` : ""}
            </option>
          ))}
          <option value="__nouveau__">+ Nouveau client</option>
        </Select>

        <AnimatePresence initial={false}>
          {clientChoice === "__nouveau__" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input id="clientNom" name="clientNom" label="Nom" required />
                <Input id="clientPrenom" name="clientPrenom" label="Prénom" required />
                <Input id="clientTelephone1" name="clientTelephone1" label="Téléphone" type="tel" required />
                <Input id="clientEmail" name="clientEmail" label="E-mail" type="email" required />
                <Input id="clientPiece" name="clientPiece" label="CIN / Passeport" containerClassName="sm:col-span-2" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Card className="p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h3 text-navy-900">Échéancier de paiement</h2>
          <Badge tone={total === 100 ? "success" : "danger"} dot className="tabular" data-testid="total-pourcentages">
            Total {total}%
          </Badge>
        </div>
        <p className="mb-4 text-caption text-navy-400">
          Par défaut : 40% le jour du blocage, puis 20% tous les 6 mois. Vous pouvez modifier les pourcentages et
          les dates.
        </p>
        <ol className="space-y-3">
          {[1, 2, 3, 4].map((n, i) => (
            <li key={n} className="grid grid-cols-[auto_1fr_1fr] items-center gap-3 rounded-md bg-navy-50 p-3">
              <div className="flex flex-col items-center gap-1 pr-1">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white tabular">
                  {n}
                </span>
                <span className="text-caption text-navy-400 tabular">{formatMoney(Math.round((prix * (pct[i] || 0)) / 100))}</span>
              </div>
              <Input
                id={`tranche${n}Pourcentage`}
                name={`tranche${n}Pourcentage`}
                type="number"
                label="Pourcentage"
                min={0}
                max={100}
                value={Number.isFinite(pct[i]) ? pct[i] : ""}
                onChange={(e) => setPct((p) => p.map((v, j) => (j === i ? e.target.valueAsNumber : v)))}
                clearable={false}
                required
              />
              <Input id={`tranche${n}Date`} name={`tranche${n}Date`} type="date" label="Date" defaultValue={defaultDates[i]} clearable={false} required />
            </li>
          ))}
        </ol>
      </Card>

      {state?.error && <Callout tone="danger">{state.error}</Callout>}

      <Button type="submit" variant="gold" loading={pending} className="w-full" size="lg">
        <Send className="h-4 w-4" /> Envoyer la proposition au PDG
      </Button>
    </form>
  );
}
