"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { modifierRecrue } from "../../actions";
import { Card, Input, Callout } from "@/components/ui/Primitives";
import { Button, LinkButton } from "@/components/ui/Button";

export function ModifierRecrueForm({ recrue }: { recrue: { id: string; nom: string; prenom: string; email: string | null } }) {
  const [state, formAction, pending] = useActionState(modifierRecrue, undefined);
  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-3" data-testid="form-modifier-recrue">
        <input type="hidden" name="userId" value={recrue.id} />
        <Input id="nom" name="nom" label="Nom" defaultValue={recrue.nom} required />
        <Input id="prenom" name="prenom" label="Prénom" defaultValue={recrue.prenom} required />
        <Input id="email" name="email" type="email" label="E-mail" defaultValue={recrue.email ?? ""} />
        {state?.error && <Callout tone="danger">{state.error}</Callout>}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" loading={pending}>
            <Save className="h-4 w-4" /> Enregistrer les modifications
          </Button>
          <LinkButton href="/dashboard/equipe" variant="ghost">
            Annuler
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
