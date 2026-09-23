"use client";

import { useActionState } from "react";
import { KeyRound, UserRoundPlus } from "lucide-react";
import { createRecrue } from "./actions";
import { Card, Input, Select, Callout } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

/** Formulaire de recrutement : les statuts proposés sont ceux du pôle du directeur connecté. */
export function NewRecrueForm({ roles }: { roles: { value: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(createRecrue, undefined);

  return (
    <Card className="p-5 lg:sticky lg:top-24" data-testid="form-recrue">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy [&_svg]:h-4 [&_svg]:w-4">
          <UserRoundPlus />
        </span>
        <h2 className="text-h3 text-navy-900">Nouvelle recrue</h2>
      </div>

      {state?.success ? (
        <div className="space-y-3">
          <p className="text-small text-navy-900">
            Compte {roles.find((r) => r.value === state.success!.role)?.label ?? ""} créé. Identifiants à communiquer :
          </p>
          <Card elevation={0} className="p-4" data-testid="bloc-acces">
            <div className="flex items-start justify-between gap-3">
              <p className="text-small font-medium text-navy-900">
                {roles.find((r) => r.value === state.success!.role)?.label ?? "Accès"}
              </p>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold-50 text-gold-600">
                <KeyRound className="h-4 w-4" />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-sm bg-navy-50 px-3 py-2.5 font-mono text-caption">
              <dt className="text-navy-400">Identifiant</dt>
              <dd className="text-navy-900">{state.success.identifiant}</dd>
              <dt className="text-navy-400">Mot de passe</dt>
              <dd className="text-navy-900">{state.success.password}</dd>
            </dl>
          </Card>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <Input id="nom" name="nom" label="Nom" required />
          <Input id="prenom" name="prenom" label="Prénom" required />
          <Input id="email" name="email" type="email" label="E-mail" />
          <Select id="role" name="role" label="Statut" defaultValue={roles[0]?.value}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          {state?.error && <Callout tone="danger">{state.error}</Callout>}
          <Button type="submit" size="sm" loading={pending} className="w-full">
            Créer le compte
          </Button>
        </form>
      )}
    </Card>
  );
}
