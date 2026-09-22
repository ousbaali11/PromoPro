import { desc, eq } from "drizzle-orm";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, rendezvous } from "@/db/schema";
import { Card, Badge, PageHeader } from "@/components/ui/Primitives";
import { formatDateTime } from "@/lib/utils";
import { SERVICE_LABEL } from "@/lib/creneaux";
import { partitionnerRendezVous } from "@/lib/rendezvous";
import { NouveauRendezVousForm, ReponseClient } from "./RendezVousClient";

function statutDe(r: { statut: string; dernierAuteur: string }) {
  if (r.statut === "ACCEPTE") return { label: "Confirmé", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" };
  if (r.dernierAuteur === "SERVICE") return { label: "Nouvelle proposition — à votre réponse", cls: "bg-gold-50 text-gold-600 ring-gold/30" };
  return { label: "En attente du service", cls: "bg-amber-50 text-amber-700 ring-amber-600/20" };
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
    <div className="space-y-6">
      <PageHeader
        title="Rendez-vous"
        description="Proposez une date et une heure au service de votre choix ; il confirmera ou vous proposera un autre créneau."
      />

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-medium text-navy-900">Prendre rendez-vous</h2>
        <NouveauRendezVousForm biens={mesBiens.map((b) => ({ id: b.id, designation: b.designation }))} />
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">Mes rendez-vous</h2>
        {aVenir.length === 0 ? (
          <p className="rounded-md border border-dashed border-navy-100 px-4 py-3 text-sm text-navy-400">
            Aucun rendez-vous à venir.
          </p>
        ) : (
          <Card className="divide-y divide-navy-50">
            {aVenir.map((r) => {
              const s = statutDe(r);
              return (
                <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-medium text-navy-900">{formatDateTime(r.dateProposee)}</p>
                    <p className="text-xs text-navy-400">
                      {SERVICE_LABEL[r.service]}
                      {r.bienId && bienById.get(r.bienId) && ` · ${bienById.get(r.bienId)!.designation}`}
                    </p>
                    {r.notes && <p className="mt-1 text-xs text-navy-400">« {r.notes} »</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className={s.cls}>{s.label}</Badge>
                    {r.statut !== "ACCEPTE" && r.dernierAuteur === "SERVICE" && <ReponseClient rdvId={r.id} />}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {passes.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-navy-900">Historique</h2>
          <Card className="divide-y divide-navy-50">
            {passes.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-navy-400">
                  {formatDateTime(r.dateProposee)} · {SERVICE_LABEL[r.service]}
                </span>
                <Badge className={statutDe(r).cls}>{r.statut === "ACCEPTE" ? "Effectué" : "Non confirmé"}</Badge>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
