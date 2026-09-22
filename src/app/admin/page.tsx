import { desc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db/client";
import { promoteurs } from "@/db/schema";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { PromoteurActions } from "./PromoteurActions";

const LABELS: Record<string, string> = { EN_ATTENTE: "En attente", ACTIF: "Actif", SUSPENDU: "Suspendu" };
const COLORS: Record<string, string> = {
  EN_ATTENTE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ACTIF: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  SUSPENDU: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export default async function AdminPage() {
  const rows = await db.query.promoteurs.findMany({ orderBy: [desc(promoteurs.createdAt)] });

  return (
    <div>
      <PageHeader
        title="Promoteurs"
        description="Chaque promoteur paie son abonnement par virement, hors plateforme. Activez-le ici une fois le virement constaté."
        action={
          <LinkButton href="/admin/nouveau" size="sm">
            <Plus className="h-4 w-4" /> Nouveau promoteur
          </LinkButton>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Aucun promoteur" description="Créez le premier compte promoteur." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Promoteur</th>
                <th className="px-5 py-3 font-medium">Abonnement</th>
                <th className="px-5 py-3 font-medium">Échéance</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-navy-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-900">{p.nom}</td>
                  <td className="px-5 py-3 text-navy-400">{p.abonnementFormule ?? "—"}</td>
                  <td className="px-5 py-3 text-navy-400">{formatDate(p.abonnementFin)}</td>
                  <td className="px-5 py-3">
                    <Badge className={COLORS[p.statut]}>{LABELS[p.statut]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <PromoteurActions promoteurId={p.id} statut={p.statut} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
