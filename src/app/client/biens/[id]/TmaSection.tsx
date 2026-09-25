"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Hammer, Paperclip, FileDown, CheckSquare } from "lucide-react";
import { demanderTma, accepterDevisTma } from "./actions";
import { Button } from "@/components/ui/Button";
import { Callout, Textarea } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FileUpload } from "@/components/ui/FileUpload";
import { TMA_LABELS, TMA_TONES, type StatutTma } from "@/lib/tma";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

export type DemandeTmaVue = {
  id: string;
  description: string;
  statut: string;
  montant: string | null;
  devisUrl: string | null;
  croquisUrl: string | null;
  motifRefus: string | null;
  dateDemande: string;
  signatureClientAt: string | null;
};

/**
 * Travaux modificatifs côté client : dépôt d'une demande (tant que la fenêtre
 * est ouverte), suivi des demandes, acceptation du devis par case horodatée.
 */
export function TmaSection({
  bienId,
  demandes,
  ouvert,
  dateLimite,
  raisonFermeture,
}: {
  bienId: string;
  demandes: DemandeTmaVue[];
  ouvert: boolean;
  /** Date limite formatée (affichée au client) */
  dateLimite: string;
  raisonFermeture: string | null;
}) {
  const [formOuvert, setFormOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(demanderTma, undefined);

  return (
    <div className="space-y-4" data-testid="section-tma">
      {ouvert ? (
        <>
          <p className="text-caption text-navy-400">
            Demandes possibles jusqu&apos;au{" "}
            <span className="font-medium text-navy-900" data-testid="tma-limite">
              {dateLimite}
            </span>
            . Chaque demande fait l&apos;objet
            d&apos;un devis à accepter avant travaux.
          </p>
          {state?.success ? (
            <Callout tone="success" testId="tma-succes">
              {state.success}
            </Callout>
          ) : (
            <>
              {!formOuvert && (
                <Button size="sm" variant="gold" onClick={() => setFormOuvert(true)}>
                  <Hammer className="h-4 w-4" /> Demander une modification
                </Button>
              )}
              <AnimatePresence initial={false}>
                {formOuvert && (
                  <motion.form
                    action={formAction} onSubmit={soumettreSansReinitialiser(formAction)}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
                    className="overflow-clip"
                    data-testid="form-tma"
                  >
                    <div className="space-y-3 rounded-md bg-navy-50 p-3">
                      <input type="hidden" name="bienId" value={bienId} />
                      <Textarea
                        id="tma-description"
                        name="description"
                        rows={3}
                        label="Modification souhaitée"
                        hint="Ex. déplacer une cloison, ajouter une prise, changer le revêtement de sol…"
                        error={state?.error}
                        required
                      />
                      <FileUpload name="croquisUrl" type="tma-croquis" label="Photo ou croquis (facultatif)" />
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" variant="gold" loading={pending}>
                          Envoyer la demande
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setFormOuvert(false)}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </>
          )}
        </>
      ) : (
        <Callout tone="neutral" testId="tma-ferme">
          {raisonFermeture ?? `La période de dépôt des demandes est terminée depuis le ${dateLimite}.`}
        </Callout>
      )}

      {demandes.length > 0 && (
        <div className="divide-y divide-navy-50 rounded-md ring-1 ring-navy-100/70">
          {demandes.map((d) => (
            <DemandeTma key={d.id} demande={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DemandeTma({ demande }: { demande: DemandeTmaVue }) {
  const statut = demande.statut as StatutTma;
  const [state, formAction, pending] = useActionState(accepterDevisTma, undefined);
  return (
    <div className="space-y-3 p-4" data-testid="demande-tma" data-statut-tma={demande.statut} data-id={demande.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-small text-navy-900">{demande.description}</p>
          <p className="mt-1 text-caption text-navy-400">
            Demandée le {demande.dateDemande}
            {demande.signatureClientAt && ` · devis accepté le ${demande.signatureClientAt}`}
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            {demande.croquisUrl && (
              <a href={demande.croquisUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-caption font-medium text-gold-600 underline-offset-2 hover:underline">
                <Paperclip className="h-3.5 w-3.5" /> Pièce jointe
              </a>
            )}
            {demande.devisUrl && (
              <a href={demande.devisUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-caption font-medium text-gold-600 underline-offset-2 hover:underline">
                <FileDown className="h-3.5 w-3.5" /> Devis PDF
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge statut={demande.statut} label={TMA_LABELS[statut] ?? demande.statut} tone={TMA_TONES[statut] ?? "neutral"} />
          {demande.montant && <span className="text-small font-semibold tabular text-navy-900">{demande.montant}</span>}
        </div>
      </div>

      {statut === "REFUSE" && demande.motifRefus && <Callout tone="danger">{demande.motifRefus}</Callout>}

      {statut === "CHIFFRE" && (
        <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-2 rounded-md bg-gold-50 p-3 ring-1 ring-inset ring-gold-200" data-testid="form-acceptation-devis">
          <input type="hidden" name="demandeId" value={demande.id} />
          <label className="flex cursor-pointer items-start gap-2 text-small text-navy-900">
            <input type="checkbox" name="acceptation" className="mt-0.5 h-4 w-4 accent-gold" required />
            <span>
              J&apos;accepte ce devis de <span className="font-semibold tabular">{demande.montant}</span> et autorise les travaux.
              <span className="block text-caption text-navy-400">Acceptation horodatée ; ce n&apos;est pas une signature électronique certifiée.</span>
            </span>
          </label>
          {state?.error && <Callout tone="danger">{state.error}</Callout>}
          <Button type="submit" size="sm" variant="gold" loading={pending}>
            <CheckSquare className="h-4 w-4" /> Accepter le devis
          </Button>
        </form>
      )}
    </div>
  );
}
