"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Primitives";
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
  return (
    <div>
      {!open && (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Ajouter un paiement pour {clientNom}
        </Button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-hidden"
          >
            <div className="rounded-md bg-navy-50 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <Callout tone="info" className="flex-1">
                  Paiement constaté (relevé bancaire, chèque reçu…) mais non déclaré par le client : il est validé
                  immédiatement, le reçu est généré et le client est notifié.
                </Callout>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Fermer">
                  <X className="h-4 w-4" /> Fermer
                </Button>
              </div>
              <PaiementForm
                action={ajouterPaiementRecouvrement}
                bienId={bienId}
                echeances={echeances}
                withReference
                submitLabel="Enregistrer et valider"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
