"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Upload } from "lucide-react";
import { deposerCopieSignee } from "./actions";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Primitives";
import { FileUpload } from "@/components/ui/FileUpload";

/** Dépôt de la 4e copie signée et cachetée (section 7.3). */
export function CopieSigneeForm({ contratId }: { contratId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deposerCopieSignee, undefined);

  return (
    <div className="inline-block text-left">
      {!open && (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Upload className="h-4 w-4" /> Déposer la copie signée
        </Button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            action={formAction}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="w-72 overflow-hidden"
          >
            <div className="space-y-2 rounded-md bg-navy-50 p-3">
              <input type="hidden" name="contratId" value={contratId} />
              <FileUpload name="copieSigneeUrl" type="contrats" label="4e copie signée et cachetée" required />
              {state?.error && <Callout tone="danger">{state.error}</Callout>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={pending}>
                  Enregistrer
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
