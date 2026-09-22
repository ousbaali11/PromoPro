import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Plus, ChevronRight } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { projets, biens } from "@/db/schema";
import { Card, PageHeader, EmptyState } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";

export default async function ProjetsPage() {
  const session = await requireStaffSession();

  const rows = await db.query.projets.findMany({
    where: eq(projets.promoteurId, session.promoteurId!),
    orderBy: [desc(projets.createdAt)],
  });

  const counts = await Promise.all(
    rows.map(async (p) => {
      const list = await db.query.biens.findMany({ where: eq(biens.projetId, p.id) });
      return { total: list.length, disponibles: list.filter((b) => b.statut === "DISPONIBLE").length };
    }),
  );

  return (
    <div>
      <PageHeader
        title="Projets & biens"
        description="Liste des programmes immobiliers de PromoPro."
        action={
          session.role === "DIRECTEUR_COMMERCIAL" ? (
            <LinkButton href="/dashboard/projets/nouveau" size="sm">
              <Plus className="h-4 w-4" /> Nouveau projet
            </LinkButton>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Aucun projet pour l'instant"
          description={
            session.role === "DIRECTEUR_COMMERCIAL"
              ? "Créez le premier projet pour commencer à saisir son tableau de biens."
              : "Le Directeur Commercial n'a pas encore saisi de projet."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p, i) => (
            <Link key={p.id} href={`/dashboard/projets/${p.id}`}>
              <Card className="p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-navy-900">{p.nom}</p>
                    <p className="mt-0.5 text-xs text-navy-400">{p.nomCompte}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-navy-400" />
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-navy-400">
                  <span>{counts[i].total} bien(s)</span>
                  <span className="text-emerald-600">{counts[i].disponibles} disponible(s)</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
