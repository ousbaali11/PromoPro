"use client";

import { useActionState, useTransition, useRef, useEffect } from "react";
import { Lock, LockOpen } from "lucide-react";
import { blockBien, unblockBien, setPlanBien } from "./actions";
import { Card, Textarea, Input, Callout } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

export function BlockBienForm({ bienId }: { bienId: string }) {
  const [state, formAction, pending] = useActionState(blockBien, undefined);

  return (
    <Card className="p-5">
      <h2 className="text-h3 text-navy-900">Bloquer ce bien</h2>
      <p className="mb-4 mt-1 text-caption text-navy-400">
        Le bien sera retiré de la vente pour tous les commerciaux. Votre commentaire reste privé.
      </p>
      <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-3">
        <input type="hidden" name="bienId" value={bienId} />
        <Textarea
          id="commentaire"
          name="commentaire"
          rows={2}
          label="Commentaire (visible par vous seul)"
          hint="ex. Réservé pour un partenaire…"
          error={state?.error}
        />
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          <Lock className="h-4 w-4" /> Bloquer ce bien
        </Button>
      </form>
    </Card>
  );
}

export function PlanUploadForm({
  bienId,
  plans,
}: {
  bienId: string;
  plans: { plan2dUrl: string | null; plan3dUrl: string | null; visiteVirtuelleUrl: string | null };
}) {
  const [state, formAction, pending] = useActionState(setPlanBien, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && !state.error) formRef.current?.reset(); // succès : on repart d'un formulaire vide (comme avant)
  }, [state]);
  return (
    <form ref={formRef} action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-3" data-testid="form-plans">
      <input type="hidden" name="bienId" value={bienId} />
      <FileUpload name="plan2dUrl" type="plans" label={plans.plan2dUrl ? "Remplacer le plan 2D" : "Plan 2D (image ou PDF)"} />
      <FileUpload
        name="plan3dUrl"
        type="plans-3d"
        accept=".glb,.gltf"
        label={plans.plan3dUrl ? "Remplacer le modèle 3D" : "Modèle 3D (.glb ou .gltf)"}
        hint="Affiché dans un visualiseur 3D manipulable (rotation, zoom)."
      />
      <Input
        name="visiteVirtuelleUrl"
        type="url"
        label="Lien de visite virtuelle (facultatif)"
        defaultValue={plans.visiteVirtuelleUrl ?? ""}
        hint="Adresse https:// d'une visite 360° (Matterport, Kuula…), affichée dans un onglet du bien."
      />
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Enregistrer les plans
      </Button>
    </form>
  );
}

export function UnblockBienButton({ bienId }: { bienId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={() => startTransition(() => unblockBien(bienId))}>
      <LockOpen className="h-4 w-4" /> Débloquer ce bien
    </Button>
  );
}
