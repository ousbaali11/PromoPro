import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Plus, ChevronRight, Building2, LayoutGrid, KeyRound } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { chargerPromoteur } from "@/lib/promoteurs";
import { db } from "@/db/client";
import { projets, biens } from "@/db/schema";
import { Card, PageHeader, EmptyState, Badge, Stat } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";

export default async function ProjetsPage() {
  const session = await requireStaffSession();
  const promoteur = await chargerPromoteur(session.promoteurId!);
  const isDircom = session.role === "DIRECTEUR_COMMERCIAL";

  const rows = await db.query.projets.findMany({
    where: eq(projets.promoteurId, session.promoteurId!),
    orderBy: [desc(projets.createdAt)],
  });

  const counts = await Promise.all(
    rows.map(async (p) => {
      const list = await db.query.biens.findMany({ where: eq(biens.projetId, p.id) });
      return {
        total: list.length,
        disponibles: list.filter((b) => b.statut === "DISPONIBLE").length,
        vendus: list.filter((b) => ["VENDU", "LIVRE"].includes(b.statut)).length,
        enCours: list.filter((b) => b.statut === "PROPOSITION_EN_COURS").length,
      };
    }),
  );
  const totaux = counts.reduce(
    (t, c) => ({ total: t.total + c.total, disponibles: t.disponibles + c.disponibles, vendus: t.vendus + c.vendus }),
    { total: 0, disponibles: 0, vendus: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Projets & biens"
        description={`Liste des programmes immobiliers de ${promoteur.nom}.`}
        action={
          isDircom ? (
            <LinkButton href="/dashboard/projets/nouveau" size="sm">
              <Plus className="h-4 w-4" /> Nouveau projet
            </LinkButton>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="Aucun projet pour l'instant"
          description={
            isDircom
              ? "Créez le premier projet pour commencer à saisir son tableau de biens."
              : "Le Directeur Commercial n'a pas encore saisi de projet."
          }
          action={
            isDircom ? (
              <LinkButton href="/dashboard/projets/nouveau" size="sm">
                <Plus className="h-4 w-4" /> Nouveau projet
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <Stat label="Projets" value={rows.length} icon={<Building2 />} />
            <Stat label="Biens" value={totaux.total} icon={<LayoutGrid />} />
            <Stat
              label="Disponibles"
              value={totaux.disponibles}
              tone={totaux.disponibles > 0 ? "success" : undefined}
              icon={<KeyRound />}
              hint={`${totaux.vendus} vendu${totaux.vendus > 1 ? "s" : ""}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p, i) => {
              const c = counts[i];
              const avancement = c.total ? Math.round((c.vendus / c.total) * 100) : 0;
              return (
                <Link
                  key={p.id}
                  href={`/dashboard/projets/${p.id}`}
                  className="group block rounded-lg focus-visible:outline-none focus-visible:shadow-focus"
                  data-testid="projet-carte"
                >
                  <Card interactive className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-label uppercase text-gold-600">{p.nomCompte}</p>
                        <p className="mt-1 truncate text-h3 text-navy-900">{p.nom}</p>
                      </div>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-300 transition-[background-color,color,transform] duration-normal ease-out-soft group-hover:translate-x-0.5 group-hover:bg-gold-50 group-hover:text-gold-600">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral" className="tabular">
                        {c.total} bien{c.total > 1 ? "s" : ""}
                      </Badge>
                      <Badge tone={c.disponibles > 0 ? "success" : "neutral"} dot className="tabular">
                        {c.disponibles} disponible{c.disponibles > 1 ? "s" : ""}
                      </Badge>
                      {c.enCours > 0 && (
                        <Badge tone="info" dot className="tabular">
                          {c.enCours} en cours
                        </Badge>
                      )}
                    </div>

                    <div className="mt-auto pt-5">
                      <div className="flex items-center justify-between text-caption text-navy-400">
                        <span>Commercialisation</span>
                        <span className="tabular font-medium text-navy-900">{avancement}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-50">
                        <div
                          className="h-full rounded-full bg-gold transition-[width] duration-slow ease-out-soft"
                          style={{ width: `${avancement}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
