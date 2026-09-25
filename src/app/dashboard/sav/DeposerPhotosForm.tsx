"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera } from "lucide-react";
import { deposerPhotos } from "./actions";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { Field, Input, Callout } from "@/components/ui/Primitives";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

/** Dépôt multiple de photos d'avancement en réponse à une demande client (12.4). */
export function DeposerPhotosForm({ demandeId }: { demandeId: string }) {
  const [open, setOpen] = useState(false);
  const action = deposerPhotos.bind(null, demandeId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="w-full text-left sm:w-auto">
      {!open && (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Camera className="h-4 w-4" /> Déposer des photos
        </Button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            action={formAction} onSubmit={soumettreSansReinitialiser(formAction)}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="w-full overflow-clip sm:w-96"
          >
            <div className="space-y-3 rounded-md bg-navy-50 p-3">
              <FileUpload name="photos" type="photos-avancement" label="Photos (JPG, PNG ou PDF)" multiple required accept=".jpg,.jpeg,.png,.pdf" />
              <Field label="Légende (facultatif)" htmlFor={`legende-${demandeId}`}>
                <Input id={`legende-${demandeId}`} name="legende" placeholder="Légende, ex. Gros œuvre terminé" />
              </Field>
              {state?.error && <Callout tone="danger">{state.error}</Callout>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={pending}>
                  Publier pour le client
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
