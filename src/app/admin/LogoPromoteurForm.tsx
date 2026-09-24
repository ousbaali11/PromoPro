"use client";

import { useActionState, useState } from "react";
import { ImageIcon } from "lucide-react";
import { definirLogoPromoteur, type LogoState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Callout } from "@/components/ui/Primitives";
import { FileUpload } from "@/components/ui/FileUpload";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

/**
 * Logo d'un promoteur (optionnel) : vignette dans la liste du Super Admin et
 * fenêtre de dépôt / retrait. Le logo est repris en en-tête des contrats,
 * reçus, autorisations de visite et de l'espace client.
 */
export function LogoPromoteurForm({ promoteurId, nom, logoUrl }: { promoteurId: string; nom: string; logoUrl: string | null }) {
  const [open, setOpen] = useState(false);
  // La fenêtre se ferme depuis l'action elle-même (pas de setState dans un effet)
  const [state, formAction, pending] = useActionState<LogoState, FormData>(async (prev, formData) => {
    const resultat = await definirLogoPromoteur(promoteurId, prev, formData);
    if (resultat?.success) setOpen(false);
    return resultat;
  }, undefined);

  return (
    <div className="flex items-center gap-2" data-testid="logo-promoteur">
      {logoUrl ? (
        // Fichier servi par /api/files avec la session : pas d'optimiseur d'image Next (il n'a pas le cookie)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`Logo ${nom}`} className="h-7 w-7 rounded-sm bg-white object-contain ring-1 ring-navy-100" data-testid="logo-promoteur-image" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-navy-50 text-navy-300" aria-hidden>
          <ImageIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-testid="bouton-logo-promoteur">
        {logoUrl ? "Changer le logo" : "Ajouter un logo"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Logo — ${nom}`}
        description="PNG ou JPG. Il apparaît en en-tête des contrats, reçus, autorisations de visite et de l'espace client. Laissez vide pour retirer le logo."
      >
        <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-4" data-testid="form-logo-promoteur">
          <FileUpload name="logoUrl" type="logos" label="Logo" accept=".png,.jpg,.jpeg" defaultValue={logoUrl} />
          {state?.error && <Callout tone="danger">{state.error}</Callout>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
