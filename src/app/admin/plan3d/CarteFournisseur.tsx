"use client";

import { useActionState, useTransition } from "react";
import { FlaskConical, KeyRound, Power } from "lucide-react";
import { changerFournisseurActif, enregistrerCle, type CleState } from "./actions";
import { Card, Callout, Badge } from "@/components/ui/Primitives";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";
import type { ConfigAffichee } from "@/lib/plan3d/config";

/**
 * Carte d'un fournisseur : clé d'API (saisie masquée, seule la fin est
 * réaffichée une fois enregistrée) et bascule « actif » — le fournisseur
 * actif est celui des générations réelles sur les biens, un seul à la fois.
 * Un fournisseur sans clé (modèle interne) affiche l'état de son modèle ; un
 * fournisseur non activable reste testable dans le bac à sable seulement.
 */
export function CarteFournisseur({ config, chiffrement }: { config: ConfigAffichee; chiffrement: boolean }) {
  const [state, formAction, pending] = useActionState<CleState, FormData>((prev, fd) => enregistrerCle(config.fournisseur, prev, fd), undefined);
  const [basculePending, startTransition] = useTransition();
  const { toast } = useToast();

  const basculer = () =>
    startTransition(async () => {
      const r = await changerFournisseurActif(config.actif ? null : config.fournisseur);
      if (r.error) toast({ kind: "error", title: "Changement impossible", description: r.error });
      else toast({ kind: "success", title: config.actif ? "Fournisseur désactivé" : `${config.libelle} actif`, description: config.actif ? "Aucune génération automatique." : "Utilisé pour les générations sur les biens." });
    });

  const boutonActif = (
    <Button
      type="button"
      size="sm"
      variant={config.actif ? "ghost" : "gold"}
      loading={basculePending}
      disabled={!config.activable || !config.configure || (config.necessiteCle && !chiffrement)}
      onClick={basculer}
      title={config.activable ? undefined : config.etat}
      data-testid="bouton-actif"
    >
      <Power /> {config.actif ? "Désactiver" : "Utiliser pour les biens"}
    </Button>
  );

  return (
    <Card className="p-5" data-testid={`carte-fournisseur-${config.fournisseur}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {!config.necessiteCle && (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gold-50 text-gold-600 [&_svg]:h-4 [&_svg]:w-4">
              <FlaskConical />
            </span>
          )}
          <div>
            <h2 className="text-h3 text-navy-900">{config.libelle}</h2>
            {config.site.startsWith("http") ? (
              <a href={config.site} target="_blank" rel="noreferrer" className="text-caption text-navy-400 underline-offset-2 hover:underline">
                Documentation de l&apos;API
              </a>
            ) : (
              <span className="text-caption text-navy-400">
                Suivi : <span className="font-mono">{config.site}</span>
              </span>
            )}
          </div>
        </div>
        {config.actif ? (
          <Badge tone="success" dot data-testid="badge-actif">
            Actif
          </Badge>
        ) : config.activable ? (
          <Badge tone="neutral">Inactif</Badge>
        ) : (
          <Badge tone="warning" dot data-testid="badge-en-developpement">
            {config.etat}
          </Badge>
        )}
      </div>

      {config.description && <p className="mt-3 text-small text-navy-500">{config.description}</p>}

      <dl className="mt-4 rounded-sm bg-navy-50 px-3 py-2.5 text-small">
        <dt className="text-label uppercase text-navy-400">{config.necessiteCle ? "Clé d'API enregistrée" : "Modèle"}</dt>
        <dd className="mt-0.5 font-mono text-navy-900" data-testid="cle-masquee">
          {config.cleMasquee ?? "Aucune"}
        </dd>
      </dl>

      {config.necessiteCle ? (
        <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="mt-4 space-y-3" data-testid="form-cle">
          <Input
            id={`cle-${config.fournisseur}`}
            name="cleApi"
            type="password"
            label={config.cleMasquee ? "Nouvelle clé d'API" : "Clé d'API"}
            autoComplete="off"
            hint="Chiffrée au repos ; jamais réaffichée en clair."
            disabled={!chiffrement}
          />
          {state?.error && <Callout tone="danger">{state.error}</Callout>}
          {state?.success && (
            <Callout tone="success" testId="cle-enregistree">
              {state.success}
            </Callout>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!chiffrement}>
              <KeyRound /> Enregistrer la clé
            </Button>
            {boutonActif}
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {boutonActif}
          <p className="text-caption text-navy-400">{config.configure ? "Testez-le dans le bac à sable ci-dessous." : "Installez le modèle pour le tester (DEPLOY.md, section 12)."}</p>
        </div>
      )}
    </Card>
  );
}
