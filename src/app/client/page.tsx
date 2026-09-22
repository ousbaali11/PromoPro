import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets } from "@/db/schema";
import { Card, PageHeader, EmptyState, Badge } from "@/components/ui/Primitives";
import { formatMoney, STATUT_BIEN_LABELS, STATUT_BIEN_COLORS } from "@/lib/utils";

export default async function ClientHome() {
  const session = await requireClientSession();

  const mesBiens = await db.query.biens.findMany({ where: eq(biens.clientId, session.clientId) });

  if (mesBiens.length === 1) redirect(`/client/biens/${mesBiens[0].id}`);

  return (
    <div>
      <PageHeader title="Mon espace" description="Sélectionnez un bien pour accéder à son suivi complet." />
      {mesBiens.length === 0 ? (
        <EmptyState title="Aucun bien associé à votre compte pour l'instant" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {await Promise.all(
            mesBiens.map(async (b) => {
              const projet = await db.query.projets.findFirst({ where: eq(projets.id, b.projetId) });
              return (
                <Link key={b.id} href={`/client/biens/${b.id}`}>
                  <Card className="p-5 transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-navy-900">{b.designation}</p>
                        <p className="text-xs text-navy-400">{projet?.nom}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-navy-400" />
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm text-navy-900">{formatMoney(b.prix)}</span>
                      <Badge className={STATUT_BIEN_COLORS[b.statut]}>{STATUT_BIEN_LABELS[b.statut]}</Badge>
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
