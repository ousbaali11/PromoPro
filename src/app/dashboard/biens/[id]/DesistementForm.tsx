"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { UserRoundX } from "lucide-react";
import { enregistrerDesistement } from "./actions";
import { Card, Callout } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";

/** Section 6.5 — le commercial enregistre le désistement légalisé du client. */
export function DesistementForm({ bienId, clientNom }: { bienId: string; clientNom: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(enregistrerDesistement, undefined);

  return (
    <div>
      {!open && (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <UserRoundX className="h-4 w-4" /> Enregistrer un désistement
        </Button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="overflow-hidden"
          >
            <Card accent="danger" className="p-5">
              <h3 className="text-h3 text-navy-900">Désistement de {clientNom}</h3>
              <p className="mb-4 mt-1 text-caption text-navy-400">
                Le bien sera remis à zéro et redeviendra disponible ; la vente sera conservée dans la page « Biens
                désistés » et le Responsable Administratif sera notifié pour organiser le remboursement.
              </p>
              <form action={formAction} className="space-y-4">
                <input type="hidden" name="bienId" value={bienId} />
                <FileUpload name="documentUrl" type="desistements" label="Document de désistement légalisé" required />
                {state?.error && <Callout tone="danger">{state.error}</Callout>}
                <div className="flex gap-2">
                  <Button type="submit" variant="danger" size="sm" loading={pending}>
                    Confirmer le désistement
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                    Annuler
                  </Button>
                </div>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
