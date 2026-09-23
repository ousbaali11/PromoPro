import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card, EmptyState, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import { NomCompte } from "@/components/ui/EtatCompte";
import { rendezvousPourService, partitionnerRendezVous, type RdvRow } from "@/lib/rendezvous";
import type { Service } from "@/lib/creneaux";
import { RendezVousActions } from "./RendezVousActions";

const STATUT: Record<string, { label: string; tone: Tone }> = {
  PROPOSE: { label: "Proposé par le client", tone: "warning" },
  REPROPOSE_SERVICE: { label: "En attente du client", tone: "info" },
  REPROPOSE_CLIENT: { label: "Reproposé par le client", tone: "warning" },
  ACCEPTE: { label: "Confirmé", tone: "success" },
};

function statutDe(r: RdvRow["rdv"]) {
  if (r.statut === "ACCEPTE") return "ACCEPTE";
  if (r.statut === "REPROPOSE") return r.dernierAuteur === "SERVICE" ? "REPROPOSE_SERVICE" : "REPROPOSE_CLIENT";
  return "PROPOSE";
}

function Ligne({ row, canAct }: { row: RdvRow; canAct: boolean }) {
  const { rdv, client, bien } = row;
  const code = statutDe(rdv);
  const s = STATUT[code];
  const aRepondre = canAct && rdv.statut !== "ACCEPTE" && rdv.dernierAuteur === "CLIENT";
  const date = new Date(rdv.dateProposee);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" data-testid="rdv-ligne">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-navy-50 text-navy-900 ring-1 ring-inset ring-navy-100/70">
          <span className="text-h3 leading-none tabular">{date.getDate()}</span>
          <span className="mt-0.5 text-[10px] uppercase leading-none tracking-wide text-navy-400">
            {new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date).replace(".", "")}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-navy-900">{formatDateTime(rdv.dateProposee)}</p>
          <p className="text-caption text-navy-400">
            {client ? (
              <Link href={`/dashboard/clients/${client.id}`} className="rounded-xs font-medium text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
                <NomCompte compte={client} />
              </Link>
            ) : (
              "—"
            )}
            {client?.telephone1 && <span className="tabular"> · {client.telephone1}</span>}
            {bien && (
              <>
                {" · "}
                <Link href={`/dashboard/biens/${bien.id}`} className="rounded-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
                  {bien.designation}
                </Link>
              </>
            )}
          </p>
          {rdv.notes && <p className="mt-1 text-caption italic text-navy-400">« {rdv.notes} »</p>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <StatusBadge statut={code} label={s.label} tone={s.tone} />
        {aRepondre && <RendezVousActions rdvId={rdv.id} />}
      </div>
    </div>
  );
}

function Bloc({ titre, liste, vide, canAct }: { titre: string; liste: RdvRow[]; vide: string; canAct: boolean }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-label uppercase text-navy-400">
        {titre}
        <span className="rounded-full bg-navy-50 px-1.5 text-[11px] tabular text-navy-600 ring-1 ring-inset ring-navy-100/70">{liste.length}</span>
      </h3>
      {liste.length === 0 ? (
        <p className="rounded-md border border-dashed border-navy-100 bg-white/60 px-4 py-3 text-caption text-navy-400">{vide}</p>
      ) : (
        <Card className="divide-y divide-navy-50">
          {liste.map((r) => (
            <Ligne key={r.rdv.id} row={r} canAct={canAct} />
          ))}
        </Card>
      )}
    </div>
  );
}

/**
 * Section « Rendez-vous » d'un service (section 11.5) : en attente de réponse,
 * confirmés à venir, historique. À inclure dans la page du service concerné.
 */
export async function RendezVousSection({
  service,
  session,
  canAct,
}: {
  service: Service;
  session: { userId: string; role: string; promoteurId: string | null };
  canAct: boolean;
}) {
  const rows = await rendezvousPourService(service, session);
  const { enAttente, confirmes, passes } = partitionnerRendezVous(rows.map((r) => ({ ...r, statut: r.rdv.statut, dateProposee: r.rdv.dateProposee })));

  if (rows.length === 0) {
    return <EmptyState icon={<CalendarClock />} title="Aucun rendez-vous" description="Les demandes de rendez-vous des clients apparaîtront ici." />;
  }

  return (
    <div className="space-y-5">
      <Bloc titre="En attente" liste={enAttente} vide="Aucune demande en attente." canAct={canAct} />
      <Bloc titre="Confirmés" liste={confirmes} vide="Aucun rendez-vous confirmé à venir." canAct={canAct} />
      <Bloc titre="Historique" liste={passes.slice(0, 10)} vide="Aucun rendez-vous passé." canAct={canAct} />
    </div>
  );
}
