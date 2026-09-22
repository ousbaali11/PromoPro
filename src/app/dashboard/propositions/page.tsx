import { eq, desc } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { propositions, biens, clients, users, echeances } from "@/db/schema";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui/Primitives";
import { formatMoney, formatDate } from "@/lib/utils";
import { PropositionActions } from "./PropositionActions";

const STATUT_LABELS: Record<string, string> = {
  ENVOYEE: "En attente",
  ACCEPTEE: "Acceptée",
  REFUSEE: "Refusée",
  NEGOCIEE: "Négociée",
};
const STATUT_COLORS: Record<string, string> = {
  ENVOYEE: "bg-sky-50 text-sky-700 ring-sky-600/20",
  ACCEPTEE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REFUSEE: "bg-rose-50 text-rose-700 ring-rose-600/20",
  NEGOCIEE: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

export default async function PropositionsPage() {
  const session = await requireStaffSession();
  const isPdg = session.role === "PDG";

  const all = await db.query.propositions.findMany({
    orderBy: [desc(propositions.createdAt)],
  });

  // On filtre par promoteur (via le commercial) et, pour un commercial, par ses propres propositions.
  const rows = [];
  for (const p of all) {
    const commercial = await db.query.users.findFirst({ where: eq(users.id, p.commercialId) });
    if (!commercial || commercial.promoteurId !== session.promoteurId) continue;
    if (!isPdg && p.commercialId !== session.userId) continue;
    const bien = await db.query.biens.findFirst({ where: eq(biens.id, p.bienId) });
    const client = await db.query.clients.findFirst({ where: eq(clients.id, p.clientId) });
    const ech = await db.query.echeances.findMany({ where: eq(echeances.propositionId, p.id) });
    rows.push({ proposition: p, bien, client, commercial, echeances: ech });
  }

  return (
    <div>
      <PageHeader
        title="Propositions"
        description={isPdg ? "Propositions de vente à valider." : "Vos propositions envoyées au PDG."}
      />

      {rows.length === 0 ? (
        <EmptyState title="Aucune proposition" description="Les propositions envoyées apparaîtront ici." />
      ) : (
        <div className="space-y-4">
          {rows.map(({ proposition, bien, client, commercial, echeances: ech }) => (
            <Card key={proposition.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-navy-900">{bien?.designation}</p>
                  <p className="text-xs text-navy-400">
                    {client?.prenom} {client?.nom} · proposé par {commercial?.prenom} {commercial?.nom} ·{" "}
                    {bien && formatMoney(bien.prix)}
                  </p>
                </div>
                <Badge className={STATUT_COLORS[proposition.statut]}>{STATUT_LABELS[proposition.statut]}</Badge>
              </div>

              {ech.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ech.map((e) => (
                    <div key={e.id} className="rounded-md bg-navy-50 px-3 py-2 text-xs">
                      <p className="font-medium text-navy-900">Tranche {e.numero} · {e.pourcentage}%</p>
                      <p className="text-navy-400">{formatMoney(e.montant)}</p>
                      <p className="text-navy-400">{formatDate(e.dateEcheance)}</p>
                    </div>
                  ))}
                </div>
              )}

              {proposition.statut === "NEGOCIEE" && proposition.noteNegociation && (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Contre-proposition du PDG : {proposition.noteNegociation}
                </p>
              )}

              {isPdg && proposition.statut === "ENVOYEE" && (
                <div className="mt-4">
                  <PropositionActions propositionId={proposition.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
