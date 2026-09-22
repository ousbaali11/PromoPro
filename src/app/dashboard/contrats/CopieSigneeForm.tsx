"use client";

import { useActionState, useState } from "react";
import { deposerCopieSignee } from "./actions";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";

/** Dépôt de la 4e copie signée et cachetée (section 7.3). */
export function CopieSigneeForm({ contratId }: { contratId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deposerCopieSignee, undefined);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Déposer la copie signée
      </Button>
    );
  }
  return (
    <form action={formAction} className="w-72 space-y-2 rounded-md bg-navy-50 p-3 text-left">
      <input type="hidden" name="contratId" value={contratId} />
      <FileUpload name="copieSigneeUrl" type="contrats" label="4e copie signée et cachetée" required />
      {state?.error && <p className="text-xs text-rose-700">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "..." : "Enregistrer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
