import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets } from "@/db/schema";
import { Card, PageHeader, EmptyState } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatMoney, STATUT_BIEN_LABELS, STATUT_BIEN_TONES } from "@/lib/utils";

export default async function ClientHome() {
  const session = await requireClientSession();

  const mesBiens = await db.query.biens.findMany({ where: eq(biens.clientId, session.clientId) });

  if (mesBiens.length === 1) redirect(`/client/biens/${mesBiens[0].id}`);

  return (
    <div>
      <PageHeader title="Mon espace" description="Sélectionnez un bien pour accéder à son suivi complet." />
      {mesBiens.length === 0 ? (
        <EmptyState icon={<Home />} title="Aucun bien associé à votre compte pour l'instant" description="Votre commercial vous informera dès qu'un bien sera rattaché à votre dossier." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {await Promise.all(
            mesBiens.map(async (b) => {
              const projet = await db.query.projets.findFirst({ where: eq(projets.id, b.projetId) });
              return (
                <Link key={b.id} href={`/client/biens/${b.id}`} className="group block rounded-lg focus-visible:outline-none focus-visible:shadow-focus" data-testid="client-bien-carte">
                  <Card interactive className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-label uppercase text-gold-600">{projet?.nom}</p>
                        <p className="mt-1 text-h3 text-navy-900">{b.designation}</p>
                        <p className="text-caption text-navy-400">
                          {b.nature} · {b.surface} m²
                        </p>
                      </div>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-300 transition-[background-color,color,transform] duration-normal ease-out-soft group-hover:translate-x-0.5 group-hover:bg-gold-50 group-hover:text-gold-600">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-price tabular text-navy-900">{formatMoney(b.prix)}</span>
                      <StatusBadge statut={b.statut} label={STATUT_BIEN_LABELS[b.statut]} tone={STATUT_BIEN_TONES[b.statut] ?? "neutral"} />
                    </div>
                  </Card>
                </Link>
              );
            }),
          )}
        </div>
      )}
    </div>
  );
}
