"use client";

import { useActionState, useTransition } from "react";
import { Lock, LockOpen } from "lucide-react";
import { blockBien, unblockBien, setPlanBien } from "./actions";
import { Card, Textarea } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";

export function BlockBienForm({ bienId }: { bienId: string }) {
  const [state, formAction, pending] = useActionState(blockBien, undefined);

  return (
    <Card className="p-5">
      <h2 className="text-h3 text-navy-900">Bloquer ce bien</h2>
      <p className="mb-4 mt-1 text-caption text-navy-400">
        Le bien sera retiré de la vente pour tous les commerciaux. Votre commentaire reste privé.
      </p>
      <form action={formAction} className="space-y-3">
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

export function PlanUploadForm({ bienId, hasPlan }: { bienId: string; hasPlan: boolean }) {
  const [state, formAction, pending] = useActionState(setPlanBien, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="bienId" value={bienId} />
      <FileUpload name="planUrl" type="plans" label={hasPlan ? "Remplacer le plan" : "Importer le plan"} required />
      {state?.error && <p className="text-caption text-danger-fg">{state.error}</p>}
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Enregistrer le plan
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
