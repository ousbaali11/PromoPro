import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { UserRoundX } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { desistements, projets, clients, users } from "@/db/schema";
import { PageHeader, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { formatDate, formatMoney, STATUT_BIEN_LABELS, STATUT_BIEN_TONES } from "@/lib/utils";

const LABELS: Record<string, string> = { EN_ATTENTE: "À vérifier", VERIFIE: "Vérifié", REMBOURSE: "Remboursé" };
const TONES: Record<string, Tone> = { EN_ATTENTE: "danger", VERIFIE: "info", REMBOURSE: "success" };

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
      <DataTable
        testId="table-desistes"
        caption="Biens désistés"
        minWidth={760}
        columns={[
          { header: "Bien", sortable: true },
          { header: "Projet", hideBelow: "lg" },
          { header: "Ancien client", sortable: true },
          { header: "Commercial", hideBelow: "md" },
          { header: "Date", sortable: true, hideBelow: "sm" },
          { header: "Versé", align: "right", sortable: true },
          { header: "Traitement" },
          { header: "Bien aujourd'hui" },
        ]}
        rows={rows.map((d) => {
          const bien = bienById.get(d.bienId)!;
          const client = clientById.get(d.clientId);
          const com = d.commercialId ? userById.get(d.commercialId) : null;
          return {
            key: d.id,
            testId: "desiste-ligne",
            accent: d.statut === "EN_ATTENTE" ? "danger" : undefined,
            sort: [bien.designation, null, client ? `${client.nom} ${client.prenom}` : "", null, d.createdAt?.getTime() ?? 0, d.montantARembourser, null, null],
            cells: [
              <Link
                key="bien"
                href={`/dashboard/biens/${bien.id}`}
                className="rounded-xs font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                {bien.designation}
              </Link>,
              <span key="projet" className="text-navy-400">
                {projetById.get(bien.projetId)?.nom}
              </span>,
              client ? `${client.prenom} ${client.nom}` : "—",
              <span key="com" className="text-navy-400">
                {com ? `${com.prenom} ${com.nom}` : "—"}
              </span>,
              <span key="date" className="tabular text-navy-400">
                {formatDate(d.createdAt)}
              </span>,
              <span key="verse" className="tabular">
                {formatMoney(d.montantARembourser)}
              </span>,
              <StatusBadge key="trait" statut={d.statut} label={LABELS[d.statut]} tone={TONES[d.statut]} />,
              <StatusBadge key="bien-statut" statut={bien.statut} label={STATUT_BIEN_LABELS[bien.statut]} tone={STATUT_BIEN_TONES[bien.statut] ?? "neutral"} />,
            ],
          };
        })}
        empty={{
          icon: <UserRoundX />,
          title: "Aucun désistement",
          description: "Les biens désistés apparaîtront ici avec leur historique.",
        }}
      />
    </div>
  );
}
