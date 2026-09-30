"use client";

import { useState, useTransition } from "react";
import { activerAbonnement, prolongerAbonnement, suspendrePromoteur } from "./actions";
import { Button, ConfirmButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { DUREES_ABONNEMENT } from "@/lib/abonnement";

/**
 * Actions d'abonnement d'un promoteur (Super Admin) :
 * - en attente ou suspendu : Activer (Mensuel / Annuel) ;
 * - actif : Prolonger (Mensuel / Annuel) sans attendre l'échéance — la durée
 *   s'ajoute à l'échéance en cours —, et Suspendre (confirmation en deux temps).
 */
export function PromoteurActions({ promoteurId, statut }: { promoteurId: string; statut: string }) {
  const [pending, startTransition] = useTransition();
  const [duree, setDuree] = useState("12");
  const { toast } = useToast();
  const mois = Number(duree);

  const choixDuree = (
    <Select value={duree} onChange={(e) => setDuree(e.target.value)} className="w-auto py-1 text-xs" aria-label="Durée" data-testid="duree-abonnement">
      {DUREES_ABONNEMENT.map((d) => (
        <option key={d.mois} value={String(d.mois)}>
          {d.formule}
        </option>
      ))}
    </Select>
  );

  if (statut === "ACTIF") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {choixDuree}
        <Button
          size="sm"
          variant="gold"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await prolongerAbonnement(promoteurId, mois);
              if ("error" in r) toast({ kind: "error", title: "Prolongation impossible", description: r.error });
              else toast({ kind: "success", title: "Abonnement prolongé", description: `Nouvelle échéance : ${r.echeance}.` });
            })
          }
          data-testid="bouton-prolonger-abonnement"
        >
          Prolonger
        </Button>
        {/* Action destructive : confirmation inline à deux temps (pas de confirm() navigateur) */}
        <ConfirmButton size="sm" variant="danger" confirmLabel="Confirmer la suspension ?" onConfirm={() => suspendrePromoteur(promoteurId)} data-testid="bouton-suspendre-promoteur">
          Suspendre
        </ConfirmButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {choixDuree}
      <Button size="sm" variant="gold" loading={pending} onClick={() => startTransition(() => activerAbonnement(promoteurId, mois))}>
        Activer
      </Button>
    </div>
  );
}
