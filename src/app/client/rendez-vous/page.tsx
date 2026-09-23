import { desc, eq } from "drizzle-orm";
import { CalendarClock } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, rendezvous } from "@/db/schema";
import { Card, PageHeader, Section, EmptyState, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import { SERVICE_LABEL } from "@/lib/creneaux";
import { partitionnerRendezVous } from "@/lib/rendezvous";
import { NouveauRendezVousForm, ReponseClient } from "./RendezVousClient";

function statutDe(r: { statut: string; dernierAuteur: string }): { code: string; label: string; tone: Tone } {
  if (r.statut === "ACCEPTE") return { code: "ACCEPTE", label: "Confirmé", tone: "success" };
  if (r.dernierAuteur === "SERVICE") return { code: "A_REPONDRE", label: "Nouvelle proposition — à votre réponse", tone: "gold" };
  return { code: "EN_ATTENTE", label: "En attente du service", tone: "warning" };
}

function Tuile({ date }: { date: Date | number | string }) {
  const d = new Date(date);
  return (
    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-navy-50 text-navy-900 ring-1 ring-inset ring-navy-100/70">
      <span className="text-h3 leading-none tabular">{d.getDate()}</span>
      <span className="mt-0.5 text-[10px] uppercase leading-none tracking-wide text-navy-400">
        {new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d).replace(".", "")}
      </span>
    </div>
  );
}

export default async function ClientRendezVousPage() {
  const session = await requireClientSession();
  const mesBiens = await db.query.biens.findMany({ where: eq(biens.clientId, session.clientId) });
  const bienById = new Map(mesBiens.map((b) => [b.id, b]));
  const rows = await db.query.rendezvous.findMany({
    where: eq(rendezvous.clientId, session.clientId),
    orderBy: [desc(rendezvous.dateProposee)],
  });
  const { aVenir, passes } = partitionnerRendezVous(rows);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Rendez-vous"
        description="Proposez une date et une heure au service de votre choix ; il confirmera ou vous proposera un autre créneau."
      />

      <Card className="p-5" data-testid="carte-nouveau-rdv">
        <h2 className="mb-4 text-h3 text-navy-900">Prendre rendez-vous</h2>
        <NouveauRendezVousForm biens={mesBiens.map((b) => ({ id: b.id, designation: b.designation }))} />
      </Card>

      <Section title="Mes rendez-vous" count={aVenir.length || undefined} testId="section-mes-rdv">
        {aVenir.length === 0 ? (
          <EmptyState icon={<CalendarClock />} title="Aucun rendez-vous à venir" description="Vos demandes et les créneaux proposés par nos services apparaîtront ici." className="py-8" />
        ) : (
          <Card className="divide-y divide-navy-50">
            {aVenir.map((r) => {
              const s = statutDe(r);
              return (
                <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" data-testid="rdv-ligne">
                  <div className="flex min-w-0 items-start gap-3">
                    <Tuile date={r.dateProposee} />
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900">{formatDateTime(r.dateProposee)}</p>
                      <p className="text-caption text-navy-400">
                        {SERVICE_LABEL[r.service]}
                        {r.bienId && bienById.get(r.bienId) && ` · ${bienById.get(r.bienId)!.designation}`}
                      </p>
                      {r.notes && <p className="mt-1 text-caption italic text-navy-400">« {r.notes} »</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge statut={s.code} label={s.label} tone={s.tone} />
                    {r.statut !== "ACCEPTE" && r.dernierAuteur === "SERVICE" && <ReponseClient rdvId={r.id} />}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </Section>

      {passes.length > 0 && (
        <Section title="Historique" count={passes.length} testId="section-historique-rdv">
          <Card className="divide-y divide-navy-50">
            {passes.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-small">
                <span className="text-navy-400">
                  <span className="tabular">{formatDateTime(r.dateProposee)}</span> · {SERVICE_LABEL[r.service]}
                </span>
                <StatusBadge
                  statut={r.statut === "ACCEPTE" ? "EFFECTUE" : "NON_CONFIRME"}
                  label={r.statut === "ACCEPTE" ? "Effectué" : "Non confirmé"}
                  tone={r.statut === "ACCEPTE" ? "success" : "neutral"}
                />
              </div>
            ))}
          </Card>
        </Section>
      )}
    </div>
  );
}
