"use client";

import { useActionState, useState } from "react";
import { KeyRound, UserRoundPlus } from "lucide-react";
import { ajouterDirection, type AjoutDirectionState } from "../../actions";
import { Card, Callout } from "@/components/ui/Primitives";
import { Input, Select } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/roles";
import { ROLES_DIRECTION } from "@/lib/directions";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";
import { useHydrated } from "@/components/ui/useHydrated";

/**
 * Ajout d'une direction (PDG, Directeur Commercial ou Directeur Financier) à
 * un promoteur existant, à tout moment : plusieurs titulaires d'un même rôle
 * sont possibles. Identifiant et mot de passe temporaire générés, affichés une
 * seule fois.
 */
export function AjoutDirectionForm({ promoteurId }: { promoteurId: string }) {
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState<AjoutDirectionState, FormData>(
    (prev, formData) => ajouterDirection(promoteurId, prev, formData),
    undefined,
  );
  // Après un succès, le bloc d'accès reste affiché jusqu'à « Ajouter une autre direction » : le
  // résultat affiché est alors mémorisé comme masqué (comparaison de référence : le succès suivant
  // est un nouvel objet) et le formulaire est remonté vide (clé). Aucun état posé dans un effet.
  const [masque, setMasque] = useState<AjoutDirectionState>(undefined);
  const [cle, setCle] = useState(0);
  const succes = state?.success && state !== masque ? state.success : null;

  return (
    <Card className="p-5" data-testid="form-ajout-direction">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy [&_svg]:h-4 [&_svg]:w-4">
          <UserRoundPlus />
        </span>
        <h2 className="text-h3 text-navy-900">Ajouter une direction</h2>
      </div>

      {succes ? (
        <div className="space-y-3">
          <p className="text-small text-navy-900">
            Compte {ROLE_LABELS[succes.role]} créé. Identifiants à communiquer (ils ne seront pas affichés à nouveau) :
          </p>
          <Card elevation={0} className="p-4" data-testid="bloc-acces">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-small font-medium text-navy-900">{ROLE_LABELS[succes.role]}</p>
                <p className="text-caption text-navy-400">
                  {succes.prenom} {succes.nom}
                </p>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold-50 text-gold-600">
                <KeyRound className="h-4 w-4" />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-sm bg-navy-50 px-3 py-2.5 font-mono text-caption">
              <dt className="text-navy-400">Identifiant</dt>
              <dd className="text-navy-900">{succes.identifiant}</dd>
              <dt className="text-navy-400">Mot de passe</dt>
              <dd className="text-navy-900">{succes.password}</dd>
            </dl>
          </Card>
          <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => {
              setMasque(state);
              setCle((k) => k + 1);
            }}
            data-testid="ajouter-une-autre-direction">
            Ajouter une autre direction
          </Button>
        </div>
      ) : null}

      {/* Le formulaire est remonté (clé) après un succès pour repartir vide */}
      <form
        key={cle}
        action={formAction}
        onSubmit={soumettreSansReinitialiser(formAction)}
        className={succes ? "hidden" : "space-y-3"}
        data-hydrated={hydrated ? "true" : undefined}
      >
        <Select id="role" name="role" label="Rôle" defaultValue={ROLES_DIRECTION[0]}>
          {ROLES_DIRECTION.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Input id="nom" name="nom" label="Nom" required />
        <Input id="prenom" name="prenom" label="Prénom" required />
        <Input id="email" name="email" type="email" label="E-mail (optionnel)" hint="Permet la réinitialisation du mot de passe par e-mail." />
        {state?.error && <Callout tone="danger">{state.error}</Callout>}
        <Button type="submit" size="sm" loading={pending} className="w-full">
          Créer le compte
        </Button>
      </form>
    </Card>
  );
}
