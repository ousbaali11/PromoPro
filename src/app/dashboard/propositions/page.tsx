import { eq, desc } from "drizzle-orm";
import { FileSignature, Inbox } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { propositions, biens, clients, users, echeances } from "@/db/schema";
import { Card, PageHeader, EmptyState, Section, Callout, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatMoney, formatDate } from "@/lib/utils";
import { PropositionActions } from "./PropositionActions";

const STATUT_LABELS: Record<string, string> = {
  ENVOYEE: "En attente",
  ACCEPTEE: "Acceptée",
  REFUSEE: "Refusée",
  NEGOCIEE: "Négociée",
  DESISTEE: "Désistée",
};
const STATUT_TONES: Record<string, Tone> = {
  ENVOYEE: "info",
  ACCEPTEE: "success",
  REFUSEE: "danger",
  NEGOCIEE: "warning",
  DESISTEE: "neutral",
};

type Ligne = {
  proposition: typeof propositions.$inferSelect;
  bien: typeof biens.$inferSelect | undefined;
  client: typeof clients.$inferSelect | undefined;
  commercial: typeof users.$inferSelect;
  echeances: (typeof echeances.$inferSelect)[];
};

function CarteProposition({ ligne, isPdg }: { ligne: Ligne; isPdg: boolean }) {
  const { proposition, bien, client, commercial, echeances: ech } = ligne;
  return (
    <Card className="p-5" data-testid="proposition-carte">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-h3 text-navy-900">{bien?.designation}</p>
          <p className="mt-0.5 text-small text-navy-400">
            <span className="font-medium text-navy-900">
              {client?.prenom} {client?.nom}
            </span>
            {" · "}proposé par {commercial.prenom} {commercial.nom}
            {bien && (
              <>
                {" · "}
                <span className="tabular font-medium text-navy-900">{formatMoney(bien.prix)}</span>
              </>
            )}
          </p>
          <p className="mt-0.5 text-caption text-navy-300">Envoyée le {formatDate(proposition.createdAt)}</p>
        </div>
        <StatusBadge statut={proposition.statut} label={STATUT_LABELS[proposition.statut]} tone={STATUT_TONES[proposition.statut]} />
      </div>

      {ech.length > 0 && (
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ech.map((e) => (
            <li key={e.id} className="relative rounded-sm bg-navy-50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white tabular">
                  {e.numero}
                </span>
                <span className="text-caption font-medium text-navy-900 tabular">{e.pourcentage}%</span>
              </div>
              <p className="mt-1.5 text-small font-medium text-navy-900 tabular">{formatMoney(e.montant)}</p>
              <p className="text-caption text-navy-400 tabular">{formatDate(e.dateEcheance)}</p>
            </li>
          ))}
        </ol>
      )}

      {proposition.statut === "NEGOCIEE" && proposition.noteNegociation && (
        <Callout tone="warning" title="Contre-proposition du PDG" className="mt-4">
          {proposition.noteNegociation}
        </Callout>
      )}

      {isPdg && proposition.statut === "ENVOYEE" && (
        <div className="mt-4 border-t border-navy-50 pt-4">
          <PropositionActions propositionId={proposition.id} />
        </div>
      )}
    </Card>
  );
}

export default async function PropositionsPage() {
  const session = await requireStaffSession();
  const isPdg = session.role === "PDG";

  const all = await db.query.propositions.findMany({
    orderBy: [desc(propositions.createdAt)],
  });

  // On filtre par promoteur (via le commercial) et, pour un commercial, par ses propres propositions.
  const rows: Ligne[] = [];
  for (const p of all) {
    const commercial = await db.query.users.findFirst({ where: eq(users.id, p.commercialId) });
    if (!commercial || commercial.promoteurId !== session.promoteurId) continue;
    if (!isPdg && p.commercialId !== session.userId) continue;
    const bien = await db.query.biens.findFirst({ where: eq(biens.id, p.bienId) });
    const client = await db.query.clients.findFirst({ where: eq(clients.id, p.clientId) });
    const ech = await db.query.echeances.findMany({ where: eq(echeances.propositionId, p.id) });
    rows.push({ proposition: p, bien, client, commercial, echeances: ech });
  }

  const enAttente = rows.filter((r) => r.proposition.statut === "ENVOYEE");
  const traitees = rows.filter((r) => r.proposition.statut !== "ENVOYEE");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Propositions"
        description={isPdg ? "Propositions de vente à valider." : "Vos propositions envoyées au PDG."}
      />

      {rows.length === 0 ? (
        <EmptyState icon={<FileSignature />} title="Aucune proposition" description="Les propositions envoyées apparaîtront ici." />
      ) : (
        <>
          <Section
            title={isPdg ? "À valider" : "En attente de décision"}
            count={enAttente.length}
            countTone={enAttente.length > 0 ? "warning" : "neutral"}
            testId="propositions-en-attente"
          >
            {enAttente.length === 0 ? (
              <EmptyState icon={<Inbox />} title="Rien à traiter" description="Toutes les propositions ont reçu une décision." className="py-8" />
            ) : (
              <div className="space-y-4">
                {enAttente.map((l) => (
                  <CarteProposition key={l.proposition.id} ligne={l} isPdg={isPdg} />
                ))}
              </div>
            )}
          </Section>

          {traitees.length > 0 && (
            <Section title="Historique" count={traitees.length} testId="propositions-historique">
              <div className="space-y-4">
                {traitees.map((l) => (
                  <CarteProposition key={l.proposition.id} ligne={l} isPdg={isPdg} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
