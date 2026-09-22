"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PaiementForm } from "@/components/paiements/PaiementForm";
import { ajouterPaiementRecouvrement } from "./actions";

type EcheanceOption = { id: string; numero: number; pourcentage: number; montant: number; montantPaye: number; statut: string };

export function AjouterPaiementRecouvrement({
  bienId,
  clientNom,
  echeances,
}: {
  bienId: string;
  clientNom: string;
  echeances: EcheanceOption[];
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Ajouter un paiement pour {clientNom}
      </Button>
    );
  }
  return (
    <div className="rounded-md bg-navy-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs text-navy-400">
          Paiement constaté (relevé bancaire, chèque reçu...) mais non déclaré par le client : il est validé
          immédiatement, le reçu est généré et le client est notifié.
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-navy-400 hover:text-navy-900">
          Fermer
        </button>
      </div>
      <PaiementForm
        action={ajouterPaiementRecouvrement}
        bienId={bienId}
        echeances={echeances}
        withReference
        submitLabel="Enregistrer et valider"
      />
    </div>
  );
}
