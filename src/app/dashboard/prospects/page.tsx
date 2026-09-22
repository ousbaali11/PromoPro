import { eq, and } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { prospects, users } from "@/db/schema";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui/Primitives";
import { ProspectRowActions, RelancerButton } from "./ProspectActions";

export default async function ProspectsPage() {
  const session = await requireStaffSession();
  const isAssistant = session.role === "ASSISTANT_ADMINISTRATIF";

  const all = await db.query.prospects.findMany({ where: eq(prospects.promoteurId, session.promoteurId!) });
  const rows = isAssistant ? all : all.filter((p) => p.commercialId === session.userId);

  const commerciaux = isAssistant
    ? await db.query.users.findMany({
        where: and(eq(users.promoteurId, session.promoteurId!), eq(users.role, "COMMERCIAL")),
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Prospects"
        description={
          isAssistant
            ? "Suivi de la répartition et du traitement des prospects par les commerciaux."
            : "Vos prospects à contacter."
        }
      />

      {isAssistant && commerciaux.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {commerciaux.map((c) => {
            const restants = rows.filter((p) => p.commercialId === c.id && p.statutContact === "NON_CONTACTE").length;
            return (
              <Card key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-navy-900">
                    {c.prenom} {c.nom}
                  </p>
                  <p className="text-xs text-navy-400">{restants} non traité(s)</p>
                </div>
                {restants > 0 && <RelancerButton commercialId={c.id} />}
              </Card>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Aucun prospect" description="Les prospects importés apparaîtront ici." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Nom</th>
                <th className="px-5 py-3 font-medium">Téléphone</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Retour client</th>
                {!isAssistant && <th className="px-5 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-navy-50 last:border-0 align-top">
                  <td className="px-5 py-3 font-medium text-navy-900">{p.nom}</td>
                  <td className="px-5 py-3 text-navy-400">{p.telephone}</td>
                  <td className="px-5 py-3 text-navy-400">{p.source}</td>
                  <td className="px-5 py-3">
                    <Badge
                      className={
                        p.statutContact === "CONTACTE"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-amber-50 text-amber-700 ring-amber-600/20"
                      }
                    >
                      {p.statutContact === "CONTACTE" ? "Contacté" : "Non contacté"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 max-w-xs text-navy-400">{p.retourClient || "—"}</td>
                  {!isAssistant && (
                    <td className="px-5 py-3">
                      <ProspectRowActions prospectId={p.id} statutContact={p.statutContact} />
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
