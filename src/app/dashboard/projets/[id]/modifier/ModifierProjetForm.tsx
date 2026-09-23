"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { modifierProjet } from "../../actions";
import { Card, Input, Callout } from "@/components/ui/Primitives";
import { Button, LinkButton } from "@/components/ui/Button";

export function ModifierProjetForm({
  projet,
}: {
  projet: { id: string; nom: string; nomCompte: string; iban: string; delaiTmaJours: number };
}) {
  const [state, formAction, pending] = useActionState(modifierProjet, undefined);
  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4" data-testid="form-modifier-projet">
        <input type="hidden" name="projetId" value={projet.id} />
        <Input id="nom" name="nom" label="Nom du projet" defaultValue={projet.nom} required />
        <Input id="nomCompte" name="nomCompte" label="Nom du compte / société" defaultValue={projet.nomCompte} required />
        <Input id="iban" name="iban" label="IBAN" defaultValue={projet.iban} className="font-mono" required />
        <Input
          id="delaiTmaJours"
          name="delaiTmaJours"
          type="number"
          min={0}
          step={1}
          label="Délai des travaux modificatifs (jours après blocage)"
          defaultValue={projet.delaiTmaJours}
          clearable={false}
          hint="Fenêtre pendant laquelle un client peut demander une modification de son bien. 0 = fermé dès le blocage."
        />
        {state?.error && <Callout tone="danger">{state.error}</Callout>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            <Save className="h-4 w-4" /> Enregistrer les modifications
          </Button>
          <LinkButton href={`/dashboard/projets/${projet.id}`} variant="ghost">
            Annuler
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
