import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { Card, PageHeader, EmptyState } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { ResetPasswordButton } from "./ResetPasswordButton";

export default async function ClientsPage() {
  const session = await requireStaffSession();

  const all = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });
  const rows = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role)
    ? all.filter((c) => c.commercialId === session.userId)
    : all;

  const canCreate = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "DIRECTEUR_COMMERCIAL"].includes(session.role);
  const canReset = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role);

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Comptes clients créés pour l'accès à leur espace personnel."
        action={
          canCreate ? (
            <LinkButton href="/dashboard/clients/nouveau" size="sm">
              <Plus className="h-4 w-4" /> Nouveau client
            </LinkButton>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Aucun client" description="Les clients créés apparaîtront ici." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Nom</th>
                <th className="px-5 py-3 font-medium">Téléphone</th>
                <th className="px-5 py-3 font-medium">E-mail</th>
                <th className="px-5 py-3 font-medium">Identifiant</th>
                {canReset && <th className="px-5 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/50">
                  <td className="px-5 py-3 font-medium text-navy-900">
                    {c.prenom} {c.nom}
                  </td>
                  <td className="px-5 py-3 text-navy-400">{c.telephone1}</td>
                  <td className="px-5 py-3 text-navy-400">{c.email}</td>
                  <td className="px-5 py-3 font-mono text-xs text-navy-900">{c.identifiant}</td>
                  {canReset && (
                    <td className="px-5 py-3 text-right">
                      <ResetPasswordButton clientId={c.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
