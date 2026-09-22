"use client";

import { useActionState } from "react";
import { createRecrue } from "./actions";
import { Card, Field, Input, Select } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

export function NewRecrueForm() {
  const [state, formAction, pending] = useActionState(createRecrue, undefined);

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-medium text-navy-900">Nouvelle recrue</h2>

      {state?.success ? (
        <div className="space-y-3">
          <p className="text-sm text-navy-900">Compte créé. Identifiants à communiquer :</p>
          <div className="space-y-1 rounded-md bg-navy-50 p-3 font-mono text-xs">
            <p>Identifiant : {state.success.identifiant}</p>
            <p>Mot de passe : {state.success.password}</p>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <Field label="Nom" htmlFor="nom">
            <Input id="nom" name="nom" required />
          </Field>
          <Field label="Prénom" htmlFor="prenom">
            <Input id="prenom" name="prenom" required />
          </Field>
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" />
          </Field>
          <Field label="Statut" htmlFor="role">
            <Select id="role" name="role" defaultValue="COMMERCIAL">
              <option value="COMMERCIAL">Commercial</option>
              <option value="RESPONSABLE_COMMERCIAL">Responsable Commercial</option>
              <option value="RESPONSABLE_ADMINISTRATIF">Responsable Administratif</option>
            </Select>
          </Field>
          {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
          <Button type="submit" size="sm" disabled={pending} className="w-full">
            {pending ? "Création..." : "Créer le compte"}
          </Button>
        </form>
      )}
    </Card>
  );
}
