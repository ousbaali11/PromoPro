import { desc } from "drizzle-orm";
import { Building2, Plus } from "lucide-react";
import { db } from "@/db/client";
import { promoteurs } from "@/db/schema";
import { PageHeader, Stat, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { LinkButton } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { PromoteurActions } from "./PromoteurActions";

const LABELS: Record<string, string> = { EN_ATTENTE: "En attente", ACTIF: "Actif", SUSPENDU: "Suspendu" };
const TONES: Record<string, Tone> = { EN_ATTENTE: "warning", ACTIF: "success", SUSPENDU: "danger" };

export default async function AdminPage() {
  const rows = await db.query.promoteurs.findMany({ orderBy: [desc(promoteurs.createdAt)] });
  const nb = (statut: string) => rows.filter((p) => p.statut === statut).length;

  return (
    <div>
      <PageHeader
        eyebrow="Administration plateforme"
        title="Promoteurs"
        description="Chaque promoteur paie son abonnement par virement, hors plateforme. Activez-le ici une fois le virement constaté."
        action={
          <LinkButton href="/admin/nouveau" size="sm">
            <Plus className="h-4 w-4" /> Nouveau promoteur
          </LinkButton>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Promoteurs" value={rows.length} icon={<Building2 />} />
        <Stat label="Actifs" value={nb("ACTIF")} tone="success" />
        <Stat
          label="En attente"
          value={nb("EN_ATTENTE")}
          tone={nb("EN_ATTENTE") > 0 ? "warning" : undefined}
          hint="Virement à constater"
        />
        <Stat label="Suspendus" value={nb("SUSPENDU")} tone={nb("SUSPENDU") > 0 ? "danger" : undefined} />
      </div>

      <DataTable
        testId="table-promoteurs"
        caption="Liste des promoteurs"
        columns={[
          { header: "Promoteur", sortable: true },
          { header: "Abonnement", hideBelow: "sm" },
          { header: "Échéance", sortable: true, hideBelow: "md" },
          { header: "Statut", sortable: true },
          { header: <span className="sr-only">Actions</span>, align: "right", width: "1%" },
        ]}
        rows={rows.map((p) => ({
          key: p.id,
          testId: "promoteur-ligne",
          accent: p.statut === "EN_ATTENTE" ? "warning" : undefined,
          sort: [p.nom, null, p.abonnementFin ? new Date(p.abonnementFin).getTime() : 0, LABELS[p.statut]],
          cells: [
            <span key="nom" className="font-medium">
              {p.nom}
            </span>,
            <span key="ab" className="text-navy-400">
              {p.abonnementFormule ?? "—"}
            </span>,
            <span key="fin" className="tabular text-navy-400">
              {formatDate(p.abonnementFin)}
            </span>,
            <StatusBadge key="st" statut={p.statut} label={LABELS[p.statut]} tone={TONES[p.statut]} />,
            <PromoteurActions key="act" promoteurId={p.id} statut={p.statut} />,
          ],
        }))}
        empty={{
          title: "Aucun promoteur",
          description: "Créez le premier compte promoteur : ses trois directions recevront leurs accès.",
          icon: <Building2 />,
          action: (
            <LinkButton href="/admin/nouveau" size="sm">
              <Plus className="h-4 w-4" /> Nouveau promoteur
            </LinkButton>
          ),
        }}
      />
    </div>
  );
}
