import { eq, and } from "drizzle-orm";
import { Users, PhoneCall } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { prospects, users } from "@/db/schema";
import { Card, PageHeader, Badge, Stat } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { ProspectRowActions, RelancerButton } from "./ProspectActions";

export default async function ProspectsPage() {
  const session = await requireStaffSession();
  const isAssistant = session.role === "ASSISTANT_ADMINISTRATIF";

  const all = await db.query.prospects.findMany({ where: eq(prospects.promoteurId, session.promoteurId!) });
  const rows = isAssistant ? all : all.filter((p) => p.commercialId === session.userId);
  const nonContactes = rows.filter((p) => p.statutContact === "NON_CONTACTE").length;

  const commerciaux = isAssistant
    ? await db.query.users.findMany({
        where: and(eq(users.promoteurId, session.promoteurId!), eq(users.role, "COMMERCIAL")),
      })
    : [];
  const commercialById = new Map(commerciaux.map((c) => [c.id, c]));

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

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Prospects" value={rows.length} icon={<Users />} />
        <Stat
          label="À contacter"
          value={nonContactes}
          tone={nonContactes > 0 ? "warning" : "success"}
          icon={<PhoneCall />}
          hint={nonContactes === 0 && rows.length > 0 ? "Tous contactés" : undefined}
        />
      </div>

      {isAssistant && commerciaux.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          {commerciaux.map((c) => {
            const restants = rows.filter((p) => p.commercialId === c.id && p.statutContact === "NON_CONTACTE").length;
            return (
              <Card key={c.id} accent={restants > 0 ? "warning" : "success"} className="flex items-center gap-4 px-4 py-2.5" data-testid="commercial-carte">
                <div>
                  <p className="text-small font-medium text-navy-900">
                    {c.prenom} {c.nom}
                  </p>
                  <p className="text-caption text-navy-400">
                    {restants} non traité{restants > 1 ? "s" : ""}
                  </p>
                </div>
                {restants > 0 && <RelancerButton commercialId={c.id} />}
              </Card>
            );
          })}
        </div>
      )}

      <DataTable
        testId="table-prospects"
        caption="Prospects"
        defaultSort={{ column: 3, sens: "desc" }}
        columns={[
          { header: "Nom", sortable: true },
          { header: "Téléphone", hideBelow: "sm" },
          { header: "Source", hideBelow: "md" },
          { header: "Statut", sortable: true },
          ...(isAssistant ? [{ header: "Commercial", hideBelow: "lg" as const }] : []),
          { header: "Retour client", hideBelow: "lg" },
          ...(!isAssistant ? [{ header: <span className="sr-only">Actions</span>, align: "right" as const }] : []),
        ]}
        rows={rows.map((p) => {
          const contacte = p.statutContact === "CONTACTE";
          const com = p.commercialId ? commercialById.get(p.commercialId) : null;
          return {
            key: p.id,
            testId: "prospect-ligne",
            accent: contacte ? undefined : "warning",
            sort: [p.nom, null, null, contacte ? 0 : 1, ...(isAssistant ? [null] : []), null, ...(!isAssistant ? [null] : [])],
            cells: [
              <span key="nom" className="font-medium">
                {p.nom}
              </span>,
              <span key="tel" className="tabular text-navy-400">
                {p.telephone}
              </span>,
              <Badge key="src" tone="neutral">
                {p.source}
              </Badge>,
              <StatusBadge key="statut" statut={p.statutContact} label={contacte ? "Contacté" : "Non contacté"} tone={contacte ? "success" : "warning"} />,
              ...(isAssistant ? [<span key="com" className="text-navy-400">{com ? `${com.prenom} ${com.nom}` : "—"}</span>] : []),
              <span key="retour" className="line-clamp-2 max-w-xs text-navy-400">
                {p.retourClient || "—"}
              </span>,
              ...(!isAssistant ? [<ProspectRowActions key="actions" prospectId={p.id} statutContact={p.statutContact} />] : []),
            ],
          };
        })}
        empty={{ icon: <Users />, title: "Aucun prospect", description: "Les prospects importés apparaîtront ici." }}
      />
    </div>
  );
}
