import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { PageHeader, Breadcrumb } from "@/components/ui/Primitives";
import { ModifierProjetForm } from "./ModifierProjetForm";

export default async function ModifierProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, id) });
  if (!projet || projet.promoteurId !== session.promoteurId) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Breadcrumb items={[{ label: "Projets", href: "/dashboard/projets" }, { label: projet.nom, href: `/dashboard/projets/${projet.id}` }, { label: "Modifier" }]} />
      <PageHeader eyebrow="Projet" title="Modifier le projet" description="Les changements sont tracés dans le journal d'activité." />
      <ModifierProjetForm projet={{ id: projet.id, nom: projet.nom, nomCompte: projet.nomCompte, iban: projet.iban, delaiTmaJours: projet.delaiTmaJours }} />
    </div>
  );
}
