import { requireRole } from "@/lib/session";
import { Breadcrumb, Callout, PageHeader } from "@/components/ui/Primitives";
import { EditeurModele } from "@/components/contrats/EditeurModele";
import { modeleDuPromoteur } from "@/lib/contrats";
import { SECTIONS_PAR_DEFAUT } from "@/lib/contrats-sections";

/**
 * Gestion du modèle de contrat par défaut du promoteur (Responsable
 * Administratif) — écran séparé de l'édition d'un contrat précis. Les champs
 * dynamiques y sont des étiquettes insérées par un bouton ; ils sont remplacés
 * par les vraies données du dossier à la création de chaque contrat.
 */
export default async function ModeleContratPage() {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const modele = await modeleDuPromoteur(session.promoteurId!);
  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: "Contrats", href: "/dashboard/contrats" }, { label: "Modèle par défaut" }]} />
      <PageHeader
        title="Modèle de contrat par défaut"
        description="Sections dont partent tous les nouveaux contrats. Tapez le texte librement et insérez les champs dynamiques (nom du client, prix du bien…) avec le bouton : ils sont remplis automatiquement pour chaque dossier."
      />
      {!modele && (
        <Callout tone="info" className="mb-4" testId="modele-jeu-integre">
          Aucun modèle enregistré pour l&apos;instant : les contrats partent du jeu de sections intégré, affiché ci-dessous. Enregistrez-le pour le faire vôtre.
        </Callout>
      )}
      <EditeurModele key={modele?.updatedAt?.toString() ?? "integre"} sections={modele?.sectionsListe ?? SECTIONS_PAR_DEFAUT} existant={!!modele} />
    </div>
  );
}
