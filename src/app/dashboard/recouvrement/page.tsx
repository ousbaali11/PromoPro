import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets, clients } from "@/db/schema";
import { Card, Badge, EmptyState } from "@/components/ui/Primitives";
import { TodoModule } from "@/components/layout/TodoModule";
import { formatMoney, formatDate } from "@/lib/utils";
import { RendezVousSection } from "@/app/dashboard/rendez-vous/RendezVousSection";

export default async function RecouvrementPage() {
  const session = await requireStaffSession();

  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetIds = new Set(allProjets.map((p) => p.id));
  const allBiens = await db.query.biens.findMany();
  const bienById = new Map(allBiens.filter((b) => projetIds.has(b.projetId)).map((b) => [b.id, b]));
  const allClients = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });
  void allClients;

  const allEcheances = await db.query.echeances.findMany();
  const rows = allEcheances.filter((e) => bienById.has(e.bienId));

  return (
    <TodoModule
      title="Recouvrement"
      description="Suivi des échéanciers de paiement de tous les clients — statut vert (payé) / rouge (en retard)."
      specSection="section 13 — Recouvrement"
    >
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-navy-900">Rendez-vous</h2>
        <RendezVousSection service="RECOUVREMENT" session={session} canAct={session.role === "RECOUVREMENT"} />
      </section>
      {rows.length === 0 ? (
        <EmptyState title="Aucun échéancier" description="Les échéanciers des ventes conclues apparaîtront ici." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Bien</th>
                <th className="px-5 py-3 font-medium">Tranche</th>
                <th className="px-5 py-3 font-medium">Montant</th>
                <th className="px-5 py-3 font-medium">Échéance</th>
                <th className="px-5 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const bien = bienById.get(e.bienId);
                const late = e.statut !== "PAYEE" && new Date(e.dateEcheance) < new Date();
                return (
                  <tr key={e.id} className="border-b border-navy-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-900">{bien?.designation ?? "—"}</td>
                    <td className="px-5 py-3 text-navy-400">
                      Tranche {e.numero} · {e.pourcentage}%
                    </td>
                    <td className="px-5 py-3 text-navy-900">{formatMoney(e.montant)}</td>
                    <td className="px-5 py-3 text-navy-400">{formatDate(e.dateEcheance)}</td>
                    <td className="px-5 py-3">
                      <Badge
                        className={
                          e.statut === "PAYEE"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                            : late
                              ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                              : "bg-amber-50 text-amber-700 ring-amber-600/20"
                        }
                      >
                        {e.statut === "PAYEE" ? "Payée" : late ? "En retard" : "À venir"}
                      </Badge>
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
