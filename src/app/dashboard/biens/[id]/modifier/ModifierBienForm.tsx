"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { modifierBien } from "@/app/dashboard/projets/actions";
import { Card, Input, Select, Callout } from "@/components/ui/Primitives";
import { Button, LinkButton } from "@/components/ui/Button";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";

const NATURES = ["Appartement", "Parking", "Local commercial", "Villa"];

export function ModifierBienForm({
  bien,
}: {
  bien: { id: string; designation: string; nature: string; prix: number; surface: number };
}) {
  const [state, formAction, pending] = useActionState(modifierBien, undefined);
  const natures = NATURES.includes(bien.nature) ? NATURES : [bien.nature, ...NATURES];
  return (
    <Card className="p-6">
      <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="form-modifier-bien">
        <input type="hidden" name="bienId" value={bien.id} />
        <Input id="designation" name="designation" label="Désignation" defaultValue={bien.designation} required containerClassName="sm:col-span-2" />
        <Select id="nature" name="nature" label="Nature" defaultValue={bien.nature}>
          {natures.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </Select>
        <Input id="prix" name="prix" type="number" label="Prix (MAD)" min={0} step={1000} defaultValue={bien.prix} clearable={false} required />
        <Input id="surface" name="surface" type="number" label="Surface (m²)" min={0} step={0.5} defaultValue={bien.surface} clearable={false} required />
        {state?.error && (
          <Callout tone="danger" className="sm:col-span-2">
            {state.error}
          </Callout>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" loading={pending}>
            <Save className="h-4 w-4" /> Enregistrer les modifications
          </Button>
          <LinkButton href={`/dashboard/biens/${bien.id}`} variant="ghost">
            Annuler
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
