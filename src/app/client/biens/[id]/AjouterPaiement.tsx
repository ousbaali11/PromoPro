"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PaiementForm } from "@/components/paiements/PaiementForm";
import { ajouterPaiementClient } from "./actions";

type EcheanceOption = { id: string; numero: number; pourcentage: number; montant: number; montantPaye: number; statut: string };

export function AjouterPaiement({ bienId, echeances }: { bienId: string; echeances: EcheanceOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {!open && (
        <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Ajouter un paiement
        </Button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-clip"
          >
            <div className="rounded-md bg-navy-50 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-h3 text-navy-900">Déclarer un paiement</h3>
                  <p className="mt-1 text-caption text-navy-400">
                    Règlement d&apos;une tranche, ou versement complémentaire d&apos;une tranche réglée en plusieurs fois
                    (joignez une preuve à chaque versement). Tout montant versé en trop est automatiquement déduit de la
                    tranche suivante.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" /> Fermer
                </Button>
              </div>
              <PaiementForm action={ajouterPaiementClient} bienId={bienId} echeances={echeances} submitLabel="Déclarer ce paiement" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
