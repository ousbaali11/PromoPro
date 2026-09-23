import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { biens, projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { PageHeader, Breadcrumb, Callout } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { STATUT_BIEN_LABELS } from "@/lib/utils";
import { ModifierBienForm } from "./ModifierBienForm";

export default async function ModifierBienPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, id) });
  if (!bien) notFound();
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet || projet.promoteurId !== session.promoteurId) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Breadcrumb
        items={[
          { label: "Projets", href: "/dashboard/projets" },
          { label: projet.nom, href: `/dashboard/projets/${projet.id}` },
          { label: bien.designation, href: `/dashboard/biens/${bien.id}` },
          { label: "Modifier" },
        ]}
      />
      <PageHeader eyebrow={projet.nom} title="Modifier le bien" description="Possible tant que le bien est disponible ; tracé dans le journal d'activité." />
      {bien.statut !== "DISPONIBLE" ? (
        <Callout
          tone="warning"
          title="Ce bien n'est plus modifiable"
          testId="bien-non-modifiable"
          action={
            <LinkButton href={`/dashboard/biens/${bien.id}`} variant="secondary" size="sm">
              Retour au bien
            </LinkButton>
          }
        >
          Statut actuel : {STATUT_BIEN_LABELS[bien.statut] ?? bien.statut}. Une proposition ou une vente est en cours ou conclue.
        </Callout>
      ) : (
        <ModifierBienForm bien={{ id: bien.id, designation: bien.designation, nature: bien.nature, prix: bien.prix, surface: bien.surface }} />
      )}
    </div>
  );
}
