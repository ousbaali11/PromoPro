import { FlaskConical } from "lucide-react";
import { Card, Badge } from "@/components/ui/Primitives";
import type { FOURNISSEURS_EN_DEVELOPPEMENT } from "@/lib/plan3d/provider";

/**
 * Carte d'un fournisseur en développement (ex. « Solution PromoPro ») : information
 * seulement — aucune clé, aucune activation, absent du bac à sable — tant qu'il
 * n'a pas été validé sur de vrais plans.
 */
export function CarteEnDeveloppement({ fournisseur }: { fournisseur: (typeof FOURNISSEURS_EN_DEVELOPPEMENT)[number] }) {
  return (
    <Card className="p-5 opacity-90" data-testid={`carte-fournisseur-${fournisseur.code}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gold-50 text-gold-600 [&_svg]:h-4 [&_svg]:w-4">
            <FlaskConical />
          </span>
          <h2 className="text-h3 text-navy-900">{fournisseur.libelle}</h2>
        </div>
        <Badge tone="warning" dot data-testid="badge-en-developpement">
          {fournisseur.etat}
        </Badge>
      </div>
      <p className="mt-4 text-small text-navy-500">{fournisseur.description}</p>
      <p className="mt-3 text-caption text-navy-400">
        Avancement et sources documentés dans <span className="font-mono">{fournisseur.suivi}</span>. Ni clé d&apos;API, ni activation, ni bac à sable
        tant que la validation sur de vrais plans n&apos;est pas faite.
      </p>
    </Card>
  );
}
