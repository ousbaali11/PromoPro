"use client";

import { useActionState, useState } from "react";
import { UserRoundX } from "lucide-react";
import { enregistrerDesistement } from "./actions";
import { Card } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";

/** Section 6.5 — le commercial enregistre le désistement légalisé du client. */
export function DesistementForm({ bienId, clientNom }: { bienId: string; clientNom: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(enregistrerDesistement, undefined);

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <UserRoundX className="h-4 w-4" /> Enregistrer un désistement
      </Button>
    );
  }

  return (
    <Card className="border-l-4 border-rose-400 p-5">
      <h3 className="text-sm font-medium text-navy-900">Désistement de {clientNom}</h3>
      <p className="mb-4 mt-1 text-xs text-navy-400">
        Le bien sera remis à zéro et redeviendra disponible ; la vente sera conservée dans la page « Biens désistés »
        et le Responsable Administratif sera notifié pour organiser le remboursement.
      </p>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="bienId" value={bienId} />
        <FileUpload name="documentUrl" type="desistements" label="Document de désistement légalisé" required />
        {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="danger" size="sm" disabled={pending}>
            {pending ? "Enregistrement..." : "Confirmer le désistement"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}
