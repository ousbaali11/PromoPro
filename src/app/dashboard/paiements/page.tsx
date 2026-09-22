import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { paiements, biens, projets, clients } from "@/db/schema";
import { Card, Badge, EmptyState } from "@/components/ui/Primitives";
import { TodoModule } from "@/components/layout/TodoModule";
import { formatMoney, formatDate } from "@/lib/utils";

const LABELS: Record<string, string> = { EN_ATTENTE_COMPTABLE: "En attente", VALIDE: "Validé" };
const COLORS: Record<string, string> = {
  EN_ATTENTE_COMPTABLE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  VALIDE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export default async function PaiementsPage() {
  const session = await requireStaffSession();

  const allBiens = await db.query.biens.findMany();
  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetIds = new Set(allProjets.map((p) => p.id));
  const bienIds = new Set(allBiens.filter((b) => projetIds.has(b.projetId)).map((b) => b.id));
  const allClients = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });

  const all = await db.query.paiements.findMany();
  const rows = all
    .filter((p) => bienIds.has(p.bienId))
    .map((p) => ({
      paiement: p,
      bien: allBiens.find((b) => b.id === p.bienId),
      client: allClients.find((c) => c.id === p.clientId),
    }));

  return (
    <TodoModule
      title="Paiements"
      description="Opérations saisies par les commerciaux et les clients, en attente de validation comptable."
      specSection="section 9 — Comptable Interne"
    >
      {rows.length === 0 ? (
        <EmptyState title="Aucun paiement" description="Les paiements saisis apparaîtront ici." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Bien</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Montant</th>
                <th className="px-5 py-3 font-medium">Nature</th>
                <th className="px-5 py-3 font-medium">Référence</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ paiement, bien, client }) => (
                <tr key={paiement.id} className="border-b border-navy-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-900">{bien?.designation ?? "—"}</td>
                  <td className="px-5 py-3 text-navy-400">{client ? `${client.prenom} ${client.nom}` : "—"}</td>
                  <td className="px-5 py-3 text-navy-900">{formatMoney(paiement.montant, paiement.devise)}</td>
                  <td className="px-5 py-3 text-navy-400">{paiement.natureOperation ?? "—"}</td>
                  <td className="px-5 py-3 text-navy-400">{paiement.reference ?? "—"}</td>
                  <td className="px-5 py-3 text-navy-400">{formatDate(paiement.dateOperation)}</td>
                  <td className="px-5 py-3">
                    <Badge className={COLORS[paiement.statut]}>{LABELS[paiement.statut]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </TodoModule>
  );
}
