import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { desistements, biens, projets, clients, users } from "@/db/schema";
import { Card, Badge, EmptyState, PageHeader } from "@/components/ui/Primitives";
import { formatDate, formatMoney, STATUT_BIEN_COLORS, STATUT_BIEN_LABELS } from "@/lib/utils";

const LABELS: Record<string, string> = { EN_ATTENTE: "À vérifier", VERIFIE: "Vérifié", REMBOURSE: "Remboursé" };

/** Section 6.5 — historique des biens désistés (le bien lui-même est redevenu disponible). */
export default async function BiensDesistesPage() {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "DIRECTEUR_COMMERCIAL", "PDG"]);

  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetById = new Map(allProjets.map((p) => [p.id, p]));
  const bienById = new Map((await db.query.biens.findMany()).filter((b) => projetById.has(b.projetId)).map((b) => [b.id, b]));
  const clientById = new Map(
    (await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) })).map((c) => [c.id, c]),
  );
  const userById = new Map((await db.query.users.findMany({ where: eq(users.promoteurId, session.promoteurId!) })).map((u) => [u.id, u]));

  let rows = (await db.query.desistements.findMany({ orderBy: [desc(desistements.createdAt)] })).filter((d) =>
    bienById.has(d.bienId),
  );
  // Un commercial ne voit que les désistements de ses propres ventes
  if (session.role === "COMMERCIAL") rows = rows.filter((d) => d.commercialId === session.userId);

  return (
    <div>
      <PageHeader
        title="Biens désistés"
        description="Historique des ventes annulées après désistement du client. Ces biens sont de nouveau commercialisables."
      />
      {rows.length === 0 ? (
        <EmptyState title="Aucun désistement" description="Les biens désistés apparaîtront ici avec leur historique." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Bien</th>
                <th className="px-5 py-3 font-medium">Projet</th>
                <th className="px-5 py-3 font-medium">Ancien client</th>
                <th className="px-5 py-3 font-medium">Commercial</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Versé</th>
                <th className="px-5 py-3 font-medium">Traitement</th>
                <th className="px-5 py-3 font-medium">Bien aujourd&apos;hui</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const bien = bienById.get(d.bienId)!;
                const client = clientById.get(d.clientId);
                const com = d.commercialId ? userById.get(d.commercialId) : null;
                return (
                  <tr key={d.id} className="border-b border-navy-50 last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/biens/${bien.id}`} className="font-medium text-navy-900 hover:underline">
                        {bien.designation}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-navy-400">{projetById.get(bien.projetId)?.nom}</td>
                    <td className="px-5 py-3 text-navy-400">{client ? `${client.prenom} ${client.nom}` : "—"}</td>
                    <td className="px-5 py-3 text-navy-400">{com ? `${com.prenom} ${com.nom}` : "—"}</td>
                    <td className="px-5 py-3 text-navy-400">{formatDate(d.createdAt)}</td>
                    <td className="px-5 py-3 text-navy-900">{formatMoney(d.montantARembourser)}</td>
                    <td className="px-5 py-3">
                      <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20">{LABELS[d.statut]}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge className={STATUT_BIEN_COLORS[bien.statut]}>{STATUT_BIEN_LABELS[bien.statut]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
