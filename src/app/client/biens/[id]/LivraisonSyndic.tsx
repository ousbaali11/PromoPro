"use client";

import { useActionState, useState, useTransition } from "react";
import { PackageCheck, Check, Paperclip } from "lucide-react";
import { confirmerLivraisonClient, payerSyndic } from "./actions";
import { Button } from "@/components/ui/Button";
import { Badge, Field, Input, Select } from "@/components/ui/Primitives";
import { FileUpload } from "@/components/ui/FileUpload";

/** 11.10 — bouton « Confirmer tout » côté client + état des deux confirmations. */
export function LivraisonCard({
  bienId,
  statut,
  confirmeeClient,
  confirmeeSav,
  livreLe,
}: {
  bienId: string;
  statut: string;
  confirmeeClient: boolean;
  confirmeeSav: boolean;
  livreLe: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (statut === "LIVRE") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <PackageCheck className="h-4 w-4" /> Bien livré{livreLe && ` le ${livreLe}`} — dossier transmis au notaire.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className={confirmeeClient ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-navy-50 text-navy-400 ring-navy-100"}>
          {confirmeeClient ? <Check className="mr-1 h-3 w-3" /> : null} Vous
        </Badge>
        <Badge className={confirmeeSav ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-navy-50 text-navy-400 ring-navy-100"}>
          {confirmeeSav ? <Check className="mr-1 h-3 w-3" /> : null} Service après-vente
        </Badge>
      </div>
      {confirmeeClient ? (
        <p className="text-xs text-navy-400">Votre confirmation est enregistrée ; en attente de celle du Service Après-Vente.</p>
      ) : (
        <>
          <p className="text-xs text-navy-400">
            À la remise des clés, confirmez la bonne réception de votre bien. Une fois le Service Après-Vente
            également confirmé, le dossier sera transmis au notaire.
          </p>
          <Button
            size="sm"
            variant="gold"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await confirmerLivraisonClient(bienId);
                setError(res?.error ?? null);
              })
            }
          >
            <PackageCheck className="h-4 w-4" /> {pending ? "..." : "Confirmer tout — bien reçu"}
          </Button>
        </>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

const NATURES = [
  { value: "virement local", label: "Virement local" },
  { value: "virement international", label: "Virement international" },
  { value: "versement", label: "Versement" },
  { value: "cheque", label: "Chèque" },
];

/** 12.2 — rubrique Syndic côté client : montant à payer, déclaration de paiement, statut. */
export function SyndicCard({
  syndic,
}: {
  syndic: { id: string; montant: string; periode: string | null; statut: string; preuveUrl: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const action = payerSyndic.bind(null, syndic?.id ?? "");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!syndic) {
    return <p className="text-sm text-navy-400">Le montant de votre part de syndic sera communiqué par le Service Après-Vente.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold text-navy-900">{syndic.montant}</p>
          <p className="text-xs text-navy-400">{syndic.periode ?? "Syndic obligatoire"}</p>
        </div>
        <Badge
          className={
            syndic.statut === "PAYE"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : syndic.statut === "EN_ATTENTE_VALIDATION"
                ? "bg-sky-50 text-sky-700 ring-sky-600/20"
                : "bg-amber-50 text-amber-700 ring-amber-600/20"
          }
        >
          {syndic.statut === "PAYE" ? "Payé" : syndic.statut === "EN_ATTENTE_VALIDATION" ? "En cours de validation" : "À payer"}
        </Badge>
      </div>
      {syndic.preuveUrl && (
        <a href={syndic.preuveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold-600 hover:underline">
          <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
        </a>
      )}
      {syndic.statut === "A_PAYER" && !open && (
        <Button size="sm" variant="gold" onClick={() => setOpen(true)}>
          Déclarer mon paiement
        </Button>
      )}
      {syndic.statut === "A_PAYER" && open && (
        <form action={formAction} className="space-y-3 rounded-md bg-navy-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nature de l'opération" htmlFor="syndic-nature">
              <Select id="syndic-nature" name="natureOperation" defaultValue="virement local">
                {NATURES.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Banque" htmlFor="syndic-banque">
              <Input id="syndic-banque" name="banque" required />
            </Field>
            <Field label="Date de l'opération" htmlFor="syndic-date">
              <Input id="syndic-date" name="dateOperation" type="date" required />
            </Field>
            <Field label="Porteur" htmlFor="syndic-porteur">
              <Input id="syndic-porteur" name="porteur" required />
            </Field>
          </div>
          <FileUpload name="preuveUrl" type="preuves-paiement" label="Preuve de paiement" required />
          {state?.error && <p className="text-xs text-rose-700">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "..." : "Envoyer au service comptable"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
