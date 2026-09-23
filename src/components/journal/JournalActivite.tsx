import { and, desc, eq, gte } from "drizzle-orm";
import { ScrollText } from "lucide-react";
import { db } from "@/db/client";
import { journalActivite } from "@/db/schema";
import { PageHeader, Stat, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatDateTime } from "@/lib/utils";
import { ACTIONS_JOURNAL, ACTION_LABELS, CIBLE_LABELS, type ActionJournal } from "@/lib/journal";
import { PERIODES_JOURNAL, actionJournalValide, debutPeriodeJournal } from "@/lib/journal-filtres";

const TONES: Record<ActionJournal, Tone> = {
  CREATION: "success",
  MODIFICATION: "info",
  SUPPRESSION: "danger",
  SUSPENSION: "warning",
  RESTAURATION: "navy",
};

/**
 * Page « Journal d'activité » partagée par l'espace staff (journal du
 * promoteur) et l'administration plateforme (tous les promoteurs). Filtres
 * par type d'action et par période via l'URL.
 */
export async function JournalActivite({
  base,
  promoteurId,
  searchParams,
  description,
}: {
  base: string;
  /** null = toutes les lignes (Super Admin) */
  promoteurId: string | null;
  searchParams: { action?: string; periode?: string };
  description: string;
}) {
  const action = actionJournalValide(searchParams.action);
  const periode = searchParams.periode ?? "";
  const debut = debutPeriodeJournal(periode);

  const conditions = [
    promoteurId ? eq(journalActivite.promoteurId, promoteurId) : undefined,
    action ? eq(journalActivite.action, action) : undefined,
    debut ? gte(journalActivite.createdAt, debut) : undefined,
  ].filter(Boolean);
  const lignes = await db.query.journalActivite.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(journalActivite.createdAt)],
    limit: 500,
  });

  const url = (a: string | null, p: string) => {
    const q = new URLSearchParams();
    if (a) q.set("action", a);
    if (p) q.set("periode", p);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const compte = (a: ActionJournal) => lignes.filter((l) => l.action === a).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Journal d'activité" description={description} />

      <div className="flex flex-wrap items-center gap-3" data-testid="filtres-journal">
        <SegmentedControl
          ariaLabel="Type d'action"
          value={action ?? ""}
          items={[
            { value: "", label: "Toutes", href: url(null, periode) },
            ...ACTIONS_JOURNAL.map((a) => ({ value: a, label: ACTION_LABELS[a], href: url(a, periode) })),
          ]}
        />
        <SegmentedControl
          ariaLabel="Période"
          value={periode}
          items={PERIODES_JOURNAL.map((p) => ({ value: p.value, label: p.label, href: url(action, p.value) }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {ACTIONS_JOURNAL.map((a) => (
          <Stat key={a} label={ACTION_LABELS[a]} value={compte(a)} tone={compte(a) > 0 ? TONES[a] : undefined} />
        ))}
      </div>

      <DataTable
        testId="table-journal"
        caption="Journal d'activité"
        minWidth={760}
        pageSize={25}
        columns={[
          { header: "Date", sortable: true, width: "11rem" },
          { header: "Acteur", sortable: true },
          { header: "Action", sortable: true },
          { header: "Cible", sortable: true },
          { header: "Détails", hideBelow: "md" },
        ]}
        defaultSort={{ column: 0, sens: "desc" }}
        rows={lignes.map((l) => ({
          key: l.id,
          testId: "journal-ligne",
          sort: [l.createdAt?.getTime() ?? 0, l.acteurNom, ACTION_LABELS[l.action as ActionJournal] ?? l.action, l.cibleNom, null],
          cells: [
            <span key="d" className="tabular text-navy-400">
              {formatDateTime(l.createdAt)}
            </span>,
            <span key="a" className="font-medium">
              {l.acteurNom}
            </span>,
            <StatusBadge
              key="act"
              statut={l.action}
              label={ACTION_LABELS[l.action as ActionJournal] ?? l.action}
              tone={TONES[l.action as ActionJournal] ?? "neutral"}
            />,
            <span key="c">
              <span className="font-medium">{l.cibleNom}</span>
              <span className="ml-1.5 text-caption text-navy-400">{CIBLE_LABELS[l.cibleType] ?? l.cibleType}</span>
            </span>,
            <span key="det" className="text-navy-400">
              {l.details ?? "—"}
            </span>,
          ],
        }))}
        empty={{
          icon: <ScrollText />,
          title: "Aucune activité",
          description: action || periode ? "Aucune ligne ne correspond à ces filtres." : "Les créations, modifications, suppressions et restaurations apparaîtront ici.",
        }}
      />
    </div>
  );
}
