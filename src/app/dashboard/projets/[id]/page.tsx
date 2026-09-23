import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { projets, biens, epingles } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";
import { PageHeader, Breadcrumb } from "@/components/ui/Primitives";
import { AddBienForm } from "./AddBienForm";
import { BiensExplorer } from "./BiensExplorer";

export default async function ProjetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return (
    <div>
      <Breadcrumb items={[{ label: "Projets", href: "/dashboard/projets" }, { label: projet.nom }]} />
      <PageHeader
        eyebrow="Projet"
        title={projet.nom}
        description={`${projet.nomCompte} · IBAN ${projet.iban} · ${listeBiens.length} bien${listeBiens.length > 1 ? "s" : ""}, ${disponibles} disponible${disponibles > 1 ? "s" : ""}`}
      />

      <BiensExplorer
        biens={listeBiens.map((b) => ({
          id: b.id,
          designation: b.designation,
          nature: b.nature,
          prix: b.prix,
          surface: b.surface,
          planUrl: b.planUrl,
          statut: b.statut,
          epingle: mesEpingles.some((e) => e.bienId === b.id),
        }))}
        projetId={projet.id}
        role={session.role}
        userId={session.userId}
      />

      {session.role === "DIRECTEUR_COMMERCIAL" && (
        <div className="mt-8">
          <AddBienForm projetId={projet.id} />
        </div>
      )}
    </div>
  );
}
