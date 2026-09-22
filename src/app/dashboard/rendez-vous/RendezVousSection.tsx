import Link from "next/link";
import { Card, Badge, EmptyState } from "@/components/ui/Primitives";
import { formatDateTime } from "@/lib/utils";
import { rendezvousPourService, partitionnerRendezVous, type RdvRow } from "@/lib/rendezvous";
import type { Service } from "@/lib/creneaux";
import { RendezVousActions } from "./RendezVousActions";

const STATUT: Record<string, { label: string; cls: string }> = {
  PROPOSE: { label: "Proposé par le client", cls: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  REPROPOSE_SERVICE: { label: "En attente du client", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  REPROPOSE_CLIENT: { label: "Reproposé par le client", cls: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  ACCEPTE: { label: "Confirmé", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
};

function statutDe(r: RdvRow["rdv"]) {
  if (r.statut === "ACCEPTE") return STATUT.ACCEPTE;
  if (r.statut === "REPROPOSE") return r.dernierAuteur === "SERVICE" ? STATUT.REPROPOSE_SERVICE : STATUT.REPROPOSE_CLIENT;
  return STATUT.PROPOSE;
}

function Ligne({ row, canAct }: { row: RdvRow; canAct: boolean }) {
  const { rdv, client, bien } = row;
  const s = statutDe(rdv);
  const aRepondre = canAct && rdv.statut !== "ACCEPTE" && rdv.dernierAuteur === "CLIENT";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div>
        <p className="font-medium text-navy-900">{formatDateTime(rdv.dateProposee)}</p>
        <p className="text-xs text-navy-400">
          {client ? (
            <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
              {client.prenom} {client.nom}
            </Link>
          ) : (
            "—"
          )}
          {client?.telephone1 && ` · ${client.telephone1}`}
          {bien && (
            <>
              {" · "}
              <Link href={`/dashboard/biens/${bien.id}`} className="hover:underline">
                {bien.designation}
              </Link>
            </>
          )}
        </p>
        {rdv.notes && <p className="mt-1 text-xs text-navy-400">« {rdv.notes} »</p>}
      </div>
      <div className="flex flex-col items-end gap-2">
        <Badge className={s.cls}>{s.label}</Badge>
        {aRepondre && <RendezVousActions rdvId={rdv.id} />}
      </div>
    </div>
  );
}

function Bloc({ titre, liste, vide, canAct }: { titre: string; liste: RdvRow[]; vide: string; canAct: boolean }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-navy-400">
        {titre} <span className="ml-1 text-navy-900">{liste.length}</span>
      </h3>
      {liste.length === 0 ? (
        <p className="rounded-md border border-dashed border-navy-100 px-4 py-3 text-xs text-navy-400">{vide}</p>
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
    return <EmptyState title="Aucun rendez-vous" description="Les demandes de rendez-vous des clients apparaîtront ici." />;
  }

  return (
    <div className="space-y-5">
      <Bloc titre="En attente" liste={enAttente} vide="Aucune demande en attente." canAct={canAct} />
      <Bloc titre="Confirmés" liste={confirmes} vide="Aucun rendez-vous confirmé à venir." canAct={canAct} />
      <Bloc titre="Historique" liste={passes.slice(0, 10)} vide="Aucun rendez-vous passé." canAct={canAct} />
    </div>
  );
}
