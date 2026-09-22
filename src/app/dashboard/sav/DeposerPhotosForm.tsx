"use client";

import { useActionState, useState } from "react";
import { deposerPhotos } from "./actions";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { Input } from "@/components/ui/Primitives";

/** Dépôt multiple de photos d'avancement en réponse à une demande client (12.4). */
export function DeposerPhotosForm({ demandeId }: { demandeId: string }) {
  const [open, setOpen] = useState(false);
  const action = deposerPhotos.bind(null, demandeId);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Déposer des photos
      </Button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-3 rounded-md bg-navy-50 p-3 sm:w-96">
      <FileUpload name="photos" type="photos-avancement" label="Photos (JPG, PNG ou PDF)" multiple required accept=".jpg,.jpeg,.png,.pdf" />
      <Input name="legende" placeholder="Légende (facultatif), ex. Gros œuvre terminé" />
      {state?.error && <p className="text-xs text-rose-700">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement..." : "Publier pour le client"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
