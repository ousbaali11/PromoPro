import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/Primitives";
import { ROLE_LABELS } from "@/lib/roles";
import { NewRecrueForm } from "./NewRecrueForm";

export default async function EquipePage() {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL"]);

  const rows = await db.query.users.findMany({
    where: eq(users.promoteurId, session.promoteurId!),
  });
  const equipe = rows.filter((u) => u.id !== session.userId && u.role !== "PDG");

  return (
    <div>
      <PageHeader title="Équipe" description="Créez les comptes des nouvelles recrues commerciales." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-x-auto lg:col-span-2">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Nom</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Identifiant</th>
              </tr>
            </thead>
            <tbody>
              {equipe.map((u) => (
                <tr key={u.id} className="border-b border-navy-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-900">
                    {u.prenom} {u.nom}
                  </td>
                  <td className="px-5 py-3 text-navy-400">{ROLE_LABELS[u.role]}</td>
                  <td className="px-5 py-3 font-mono text-xs text-navy-900">{u.identifiant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <NewRecrueForm />
      </div>
    </div>
  );
}
