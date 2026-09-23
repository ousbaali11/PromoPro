import { Badge } from "@/components/ui/Primitives";
import { ETAT_LABELS, etatCompte } from "@/lib/comptes";

type Compte = { actif: boolean; deletedAt: Date | number | string | null } | null | undefined;

/**
 * Badge d'état d'un compte (utilisateur interne ou client) partout où son nom
 * est affiché en lecture : « (compte supprimé) » ou « (suspendu) ». Rien pour
 * un compte actif. Les données historiques restent affichées normalement.
 */
export function EtatCompte({ compte, className }: { compte: Compte; className?: string }) {
  if (!compte) return null;
  const etat = etatCompte(compte);
  if (etat === "actif") return null;
  return (
    <Badge tone={etat === "supprime" ? "neutral" : "warning"} className={className} data-testid="etat-compte" data-etat={etat}>
      {ETAT_LABELS[etat]}
    </Badge>
  );
}

/** Nom complet suivi de son badge d'état. */
export function NomCompte({ compte, className }: { compte: ({ nom: string; prenom: string } & NonNullable<Compte>) | null | undefined; className?: string }) {
  if (!compte) return <>—</>;
  return (
    <span className={className}>
      {compte.prenom} {compte.nom}
      <EtatCompte compte={compte} className="ml-1.5 align-middle" />
    </span>
  );
}
