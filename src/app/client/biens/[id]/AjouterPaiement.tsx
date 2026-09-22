"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { PaiementForm } from "@/components/paiements/PaiementForm";
import { ajouterPaiementClient } from "./actions";

type EcheanceOption = { id: string; numero: number; pourcentage: number; montant: number; montantPaye: number; statut: string };

export function AjouterPaiement({ bienId, echeances }: { bienId: string; echeances: EcheanceOption[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Ajouter un paiement
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-navy-900">Déclarer un paiement</h3>
          <p className="mt-1 text-xs text-navy-400">
            Règlement d&apos;une tranche, ou versement complémentaire d&apos;une tranche réglée en plusieurs fois
            (joignez une preuve à chaque versement). Tout montant versé en trop est automatiquement déduit de la
            tranche suivante.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-navy-400 hover:text-navy-900">
          Fermer
        </button>
      </div>
      <PaiementForm action={ajouterPaiementClient} bienId={bienId} echeances={echeances} submitLabel="Déclarer ce paiement" />
    </Card>
  );
}
