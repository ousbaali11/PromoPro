import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { paiements, biens, projets } from "@/db/schema";
import { Card, EmptyState } from "@/components/ui/Primitives";
import { TodoModule } from "@/components/layout/TodoModule";
import { formatMoney, formatDate } from "@/lib/utils";

export default async function FinancePage() {
  const session = await requireStaffSession();
  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetIds = new Set(allProjets.map((p) => p.id));
  const allBiens = await db.query.biens.findMany();
  const bienIds = new Set(allBiens.filter((b) => projetIds.has(b.projetId)).map((b) => b.id));

  const all = await db.query.paiements.findMany();
  const cheques = all.filter((p) => bienIds.has(p.bienId) && p.natureOperation === "cheque");
  const virements = all.filter(
    (p) => bienIds.has(p.bienId) && p.natureOperation !== "cheque" && p.dateOperation,
  );

  return (
    <TodoModule
      title="Trésorerie"
      description="Portefeuille chèques et virements/versements du jour et à venir."
      specSection="section 8 — Directeur Financier"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium text-navy-900">Portefeuille chèques</h2>
          {cheques.length === 0 ? (
            <EmptyState title="Aucun chèque" />
          ) : (
            <Card className="divide-y divide-navy-50">
              {cheques.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-navy-400">{formatDate(c.dateEncaissementCheque)}</span>
                  <span className="font-medium text-navy-900">{formatMoney(c.montant, c.devise)}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-medium text-navy-900">Virements &amp; versements</h2>
          {virements.length === 0 ? (
            <EmptyState title="Aucun virement" />
          ) : (
            <Card className="divide-y divide-navy-50">
              {virements.map((v) => (
                <div key={v.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-navy-400">{formatDate(v.dateOperation)}</span>
                  <span className="font-medium text-navy-900">{formatMoney(v.montant, v.devise)}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </TodoModule>
  );
}
