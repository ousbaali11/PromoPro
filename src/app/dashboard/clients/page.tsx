import Link from "next/link";
import { eq } from "drizzle-orm";
import { Plus, FileText, Users } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/ui/Primitives";
import { DataTable } from "@/components/ui/DataTable";
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

  const nouveau = canCreate ? (
    <LinkButton href="/dashboard/clients/nouveau" size="sm">
      <Plus className="h-4 w-4" /> Nouveau client
    </LinkButton>
  ) : undefined;

  return (
    <div>
      <PageHeader
        title="Clients"
        description={`${rows.length} compte${rows.length > 1 ? "s" : ""} client${rows.length > 1 ? "s" : ""} pour l'accès à leur espace personnel.`}
        action={nouveau}
      />

      <DataTable
        testId="table-clients"
        caption="Liste des clients"
        defaultSort={{ column: 0, sens: "asc" }}
        columns={[
          { header: "Nom", sortable: true },
          { header: "Pièce", hideBelow: "md", width: "1%" },
          { header: "Téléphone", hideBelow: "sm" },
          { header: "E-mail", hideBelow: "lg" },
          { header: "Identifiant", sortable: true },
          ...(canReset ? [{ header: <span className="sr-only">Actions</span>, align: "right" as const, width: "1%" }] : []),
        ]}
        rows={rows.map((c) => ({
          key: c.id,
          testId: "client-ligne",
          sort: [`${c.nom} ${c.prenom}`, null, null, null, c.identifiant],
          cells: [
            <Link
              key="nom"
              href={`/dashboard/clients/${c.id}`}
              className="rounded-xs font-medium text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
            >
              {c.prenom} {c.nom}
            </Link>,
            c.pieceDocUrl ? (
              <a
                key="piece"
                href={c.pieceDocUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                <FileText className="h-3.5 w-3.5" /> Voir
              </a>
            ) : (
              <span key="piece" className="text-caption text-navy-300">
                —
              </span>
            ),
            <span key="tel" className="tabular text-navy-400">
              {c.telephone1}
            </span>,
            <span key="mail" className="text-navy-400">
              {c.email}
            </span>,
            <span key="id" className="font-mono text-caption text-navy-900">
              {c.identifiant}
            </span>,
            ...(canReset ? [<ResetPasswordButton key="reset" clientId={c.id} />] : []),
          ],
        }))}
        empty={{
          icon: <Users />,
          title: "Aucun client",
          description: canCreate ? "Créez le premier dossier client : il recevra ses identifiants d'accès." : "Les clients créés apparaîtront ici.",
          action: nouveau,
        }}
      />
    </div>
  );
}
