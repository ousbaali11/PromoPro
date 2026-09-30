import { requireRole } from "@/lib/session";
import { Breadcrumb, Callout, PageHeader, Section } from "@/components/ui/Primitives";
import { chiffrementDisponible, VARIABLE_CLE } from "@/lib/plan3d/chiffrement";
import { configurationsAffichees } from "@/lib/plan3d/config";
import { listerEssais, rattraperEssais } from "@/lib/plan3d/labo";
import { CarteFournisseur } from "./CarteFournisseur";
import { BacASable, ListeEssais } from "./BacASable";

export const dynamic = "force-dynamic";

/*
 * Laboratoire de génération 3D (Super Admin) : clés d'API des fournisseurs
 * (chiffrées), choix du fournisseur actif pour les biens, bac à sable pour
 * comparer les fournisseurs sur un même plan sans toucher à aucune donnée
 * réelle. Absent de la navigation des autres rôles (layout /admin).
 */
export default async function Plan3dPage() {
  await requireRole(["SUPER_ADMIN"]);
  await rattraperEssais();
  const [configs, essais] = await Promise.all([configurationsAffichees(), listerEssais()]);
  const chiffrement = chiffrementDisponible();
  const configures = configs.filter((c) => c.cleMasquee && !c.cleMasquee.startsWith("clé ")).map((c) => c.fournisseur);
  const actif = configs.find((c) => c.actif);

  return (
    <div>
      <Breadcrumb items={[{ label: "Promoteurs", href: "/admin" }, { label: "Génération 3D" }]} />
      <PageHeader
        eyebrow="Administration plateforme"
        title="Génération de modèles 3D"
        description="Fournisseurs de conversion plan 2D → modèle 3D, clés d'API et bac à sable de comparaison."
      />

      {!chiffrement && (
        <Callout tone="danger" className="mb-6" testId="chiffrement-indisponible">
          {VARIABLE_CLE} n&apos;est pas définie sur le serveur : les clés d&apos;API ne peuvent être ni enregistrées ni utilisées (voir DEPLOY.md).
        </Callout>
      )}
      <Callout tone={actif ? "success" : "info"} className="mb-6" testId="etat-generation">
        {actif
          ? `Générations automatiques sur les biens : ${actif.libelle}. Un plan 2D déposé sur un bien sans modèle 3D déclenche une génération (au plus une par bien et par 24 h), à valider par le Directeur Commercial avant publication.`
          : "Aucun fournisseur actif : aucune génération automatique sur les biens. Le dépôt manuel d'un modèle 3D fonctionne comme avant."}
      </Callout>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {configs.map((c) => (
          <CarteFournisseur key={c.fournisseur} config={c} chiffrement={chiffrement} />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <BacASable fournisseursConfigures={configures} />
        <Section title="Essais" count={essais.length} description="Historique des comparaisons, visible ici seulement." className="lg:col-span-2" testId="section-essais">
          <ListeEssais essais={essais} />
        </Section>
      </div>
    </div>
  );
}
