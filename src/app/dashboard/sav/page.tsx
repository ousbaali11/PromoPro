import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { FileDown } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { syndics, clients, visites, biens, projets } from "@/db/schema";
import { EmptyState, Card, Badge, PageHeader } from "@/components/ui/Primitives";
import { formatMoney, formatDate, formatDateTime } from "@/lib/utils";
import { RendezVousSection } from "@/app/dashboard/rendez-vous/RendezVousSection";
import { VisiteActions } from "./VisiteActions";

const VISITE_STATUT: Record<string, { label: string; cls: string }> = {
  DEMANDEE: { label: "À traiter", cls: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  ACCEPTEE: { label: "Acceptée — créneau à choisir par le client", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  PLANIFIEE: { label: "Planifiée", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  REFUSEE: { label: "Refusée", cls: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

export default async function SavPage() {
  const session = await requireRole(["SERVICE_APRES_VENTE", "PDG"]);
  const isSav = session.role === "SERVICE_APRES_VENTE";

  const allClients = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });
  const clientById = new Map(allClients.map((c) => [c.id, c]));
  const clientIds = allClients.map((c) => c.id);
  const projetById = new Map(
    (await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) })).map((p) => [p.id, p]),
  );
  const bienById = new Map((await db.query.biens.findMany()).filter((b) => projetById.has(b.projetId)).map((b) => [b.id, b]));

  const listeVisites = clientIds.length
    ? await db.query.visites.findMany({ where: inArray(visites.clientId, clientIds), orderBy: [desc(visites.createdAt)] })
    : [];
  const visitesATraiter = listeVisites.filter((v) => v.statut === "DEMANDEE");
  const visitesAutres = listeVisites.filter((v) => v.statut !== "DEMANDEE").slice(0, 15);

  const listeSyndics = clientIds.length ? await db.query.syndics.findMany({ where: inArray(syndics.clientId, clientIds) }) : [];

  const VisiteLigne = ({ v }: { v: (typeof listeVisites)[number] }) => {
    const client = clientById.get(v.clientId);
    const bien = bienById.get(v.bienId);
    const s = VISITE_STATUT[v.statut];
    return (
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div>
          <p className="font-medium text-navy-900">
            {bien ? (
              <Link href={`/dashboard/biens/${bien.id}`} className="hover:underline">
                {bien.designation}
              </Link>
            ) : (
              "—"
            )}
            {bien && <span className="ml-2 text-xs font-normal text-navy-400">{projetById.get(bien.projetId)?.nom}</span>}
          </p>
          <p className="text-xs text-navy-400">
            {client ? `${client.prenom} ${client.nom}` : "—"}
            {client?.telephone1 && ` · ${client.telephone1}`} · demandé le {formatDate(v.createdAt)}
            {v.dateVisite && ` · visite le ${formatDateTime(v.dateVisite)}`}
          </p>
          {v.motifRefus && <p className="mt-1 text-xs text-navy-400">Motif : {v.motifRefus}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge className={s.cls}>{s.label}</Badge>
          {v.autorisationUrl && (
            <a href={v.autorisationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold-600 hover:underline">
              <FileDown className="h-3.5 w-3.5" /> Autorisation
            </a>
          )}
          {isSav && v.statut === "DEMANDEE" && <VisiteActions visiteId={v.id} />}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Service après-vente"
        description="Rendez-vous, demandes de visite, photos d'avancement, livraisons et syndic."
      />

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">Rendez-vous</h2>
        <RendezVousSection service="SAV" session={session} canAct={isSav} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">
          Demandes de visite{" "}
          <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
            {visitesATraiter.length}
          </span>
        </h2>
        {listeVisites.length === 0 ? (
          <EmptyState title="Aucune demande de visite" description="Les demandes formulées par les clients apparaîtront ici." />
        ) : (
          <div className="space-y-4">
            {visitesATraiter.length > 0 && (
              <Card className="divide-y divide-navy-50">
                {visitesATraiter.map((v) => (
                  <VisiteLigne key={v.id} v={v} />
                ))}
              </Card>
            )}
            {visitesAutres.length > 0 && (
              <Card className="divide-y divide-navy-50">
                {visitesAutres.map((v) => (
                  <VisiteLigne key={v.id} v={v} />
                ))}
              </Card>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">Syndic</h2>
        {listeSyndics.length === 0 ? (
          <EmptyState title="Aucun syndic défini" description="Les montants de syndic apparaîtront ici (module à compléter)." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Montant syndic</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {listeSyndics.map((s) => {
                  const client = clientById.get(s.clientId);
                  return (
                    <tr key={s.id} className="border-b border-navy-50 last:border-0">
                      <td className="px-5 py-3 font-medium text-navy-900">{client ? `${client.prenom} ${client.nom}` : "—"}</td>
                      <td className="px-5 py-3 text-navy-900">{formatMoney(s.montant)}</td>
                      <td className="px-5 py-3">
                        <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">{s.statut}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
