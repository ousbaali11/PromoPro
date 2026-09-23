import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { projets, biens, epingles } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";
import { PageHeader, Breadcrumb } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { Pencil } from "lucide-react";
import { AddBienForm } from "./AddBienForm";
import { BiensExplorer } from "./BiensExplorer";

export default async function ProjetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dupliquer?: string }>;
}) {
  const { id } = await params;
  const { dupliquer } = await searchParams;
  const session = await requireStaffSession();

  const projet = await db.query.projets.findFirst({ where: eq(projets.id, id) });
  if (!projet || projet.promoteurId !== session.promoteurId) notFound();

  const listeBiens = await db.query.biens.findMany({ where: eq(biens.projetId, id) });
  const mesEpingles = listeBiens.length
    ? await db.query.epingles.findMany({
        where: and(eq(epingles.userId, session.userId), inArray(epingles.bienId, listeBiens.map((b) => b.id))),
      })
    : [];

  const disponibles = listeBiens.filter((b) => b.statut === "DISPONIBLE").length;

  // « Dupliquer » depuis une fiche bien : le modèle doit être un bien de CE projet (donc du promoteur), sinon ignoré
  const source = dupliquer && session.role === "DIRECTEUR_COMMERCIAL" ? listeBiens.find((b) => b.id === dupliquer) : undefined;
  const modele = source ? { source: source.designation, nature: source.nature, prix: source.prix, surface: source.surface } : null;

  return (
    <div>
      <Breadcrumb items={[{ label: "Projets", href: "/dashboard/projets" }, { label: projet.nom }]} />
      <PageHeader
        eyebrow="Projet"
        title={projet.nom}
        description={`${projet.nomCompte} · IBAN ${projet.iban} · ${listeBiens.length} bien${listeBiens.length > 1 ? "s" : ""}, ${disponibles} disponible${disponibles > 1 ? "s" : ""} · TMA : ${projet.delaiTmaJours} j après blocage`}
        action={
          session.role === "DIRECTEUR_COMMERCIAL" ? (
            <LinkButton href={`/dashboard/projets/${projet.id}/modifier`} variant="secondary" size="sm" data-testid="modifier-projet">
              <Pencil className="h-4 w-4" /> Modifier
            </LinkButton>
          ) : undefined
        }
      />

      <BiensExplorer
        biens={listeBiens.map((b) => ({
          id: b.id,
          designation: b.designation,
          nature: b.nature,
          prix: b.prix,
          surface: b.surface,
          plan2dUrl: b.plan2dUrl,
          statut: b.statut,
          epingle: mesEpingles.some((e) => e.bienId === b.id),
        }))}
        projetId={projet.id}
        role={session.role}
        userId={session.userId}
      />

      {session.role === "DIRECTEUR_COMMERCIAL" && (
        <div className="mt-8">
          <AddBienForm projetId={projet.id} modele={modele} />
        </div>
      )}
    </div>
  );
}
