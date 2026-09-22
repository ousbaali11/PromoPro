"use client";

import { useState, useTransition } from "react";
import { activerAbonnement, suspendrePromoteur } from "./actions";
import { Button, ConfirmButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Primitives";

export function PromoteurActions({ promoteurId, statut }: { promoteurId: string; statut: string }) {
  const [pending, startTransition] = useTransition();
  const [duree, setDuree] = useState("12");

  if (statut === "ACTIF") {
    // Action destructive : confirmation inline à deux temps (pas de confirm() navigateur)
    return (
      <ConfirmButton size="sm" variant="danger" confirmLabel="Confirmer la suspension ?" onConfirm={() => suspendrePromoteur(promoteurId)}>
        Suspendre
      </ConfirmButton>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Select value={duree} onChange={(e) => setDuree(e.target.value)} className="w-auto py-1 text-xs">
        <option value="1">Mensuel</option>
        <option value="12">Annuel</option>
      </Select>
      <Button
        size="sm"
        variant="gold"
        loading={pending}
        onClick={() =>
          startTransition(() =>
            activerAbonnement(promoteurId, duree === "1" ? "Mensuel" : "Annuel", Number(duree)),
          )
        }
      >
        Activer
      </Button>
    </div>
  );
}
