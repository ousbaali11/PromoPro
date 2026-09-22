import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { syndics, clients } from "@/db/schema";
import { EmptyState, Card, Badge } from "@/components/ui/Primitives";
import { TodoModule } from "@/components/layout/TodoModule";
import { formatMoney } from "@/lib/utils";

export default async function SavPage() {
  const session = await requireStaffSession();
  const allClients = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });
  const clientIds = new Set(allClients.map((c) => c.id));
  const all = await db.query.syndics.findMany();
  const rows = all.filter((s) => clientIds.has(s.clientId));

  return (
    <TodoModule
      title="Service après-vente"
      description="Livraisons, demandes de visite, photos d'avancement et syndic obligatoire."
      specSection="section 12 — Service Après-Vente"
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune donnée pour l'instant"
          description="Livraisons, visites, photos et syndic apparaîtront ici au fur et à mesure."
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Montant syndic</th>
                <th className="px-5 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const client = allClients.find((c) => c.id === s.clientId);
                return (
                  <tr key={s.id} className="border-b border-navy-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-900">
                      {client ? `${client.prenom} ${client.nom}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-navy-900">{formatMoney(s.montant)}</td>
                    <td className="px-5 py-3">
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">{s.statut}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </TodoModule>
  );
}
