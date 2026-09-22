import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { projets, biens } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui/Primitives";
import { formatMoney, STATUT_BIEN_LABELS, STATUT_BIEN_COLORS } from "@/lib/utils";
import { AddBienForm } from "./AddBienForm";

export default async function ProjetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffSession();

  const projet = await db.query.projets.findFirst({ where: eq(projets.id, id) });
  if (!projet || projet.promoteurId !== session.promoteurId) notFound();

  const listeBiens = await db.query.biens.findMany({ where: eq(biens.projetId, id) });

  return (
    <div>
      <PageHeader title={projet.nom} description={`${projet.nomCompte} · IBAN ${projet.iban}`} />

      <Card className="overflow-hidden">
        {listeBiens.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Aucun bien saisi" description="Ajoutez le tableau de contenance ci-dessous." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Désignation</th>
                <th className="px-5 py-3 font-medium">Nature</th>
                <th className="px-5 py-3 font-medium">Prix</th>
                <th className="px-5 py-3 font-medium">Surface</th>
                <th className="px-5 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {listeBiens.map((b) => (
                <tr key={b.id} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/50">
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/biens/${b.id}`} className="font-medium text-navy-900 hover:text-gold-600">
                      {b.designation}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-navy-400">{b.nature}</td>
                  <td className="px-5 py-3 text-navy-900">{formatMoney(b.prix)}</td>
                  <td className="px-5 py-3 text-navy-400">{b.surface} m²</td>
                  <td className="px-5 py-3">
                    <Badge className={STATUT_BIEN_COLORS[b.statut]}>{STATUT_BIEN_LABELS[b.statut]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {session.role === "DIRECTEUR_COMMERCIAL" && (
        <div className="mt-6">
          <AddBienForm projetId={projet.id} />
        </div>
      )}
    </div>
  );
}
