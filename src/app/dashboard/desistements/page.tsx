import Link from "next/link";
import { NomCompte } from "@/components/ui/EtatCompte";
import { desc, eq } from "drizzle-orm";
import { Paperclip, UserRoundX, Inbox } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { desistements, projets, clients, users } from "@/db/schema";
import { Card, EmptyState, PageHeader, Section, Callout, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatMoney } from "@/lib/utils";
import { VerifierButton, RembourserForm } from "./DesistementActions";

const LABELS: Record<string, string> = { EN_ATTENTE: "À vérifier", VERIFIE: "Vérifié — remboursement en cours", REMBOURSE: "Remboursé" };
const TONES: Record<string, Tone> = { EN_ATTENTE: "warning", VERIFIE: "info", REMBOURSE: "success" };
const ACCENTS: Record<string, Tone | undefined> = { EN_ATTENTE: "warning", VERIFIE: "info", REMBOURSE: undefined };

const lien =
  "inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus";

type Ligne = typeof desistements.$inferSelect;

export default async function DesistementsPage() {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF", "DIRECTEUR_FINANCIER", "PDG"]);
  const isRespAdm = session.role === "RESPONSABLE_ADMINISTRATIF";

  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetIds = new Set(allProjets.map((p) => p.id));
  const bienById = new Map((await db.query.biens.findMany()).filter((b) => projetIds.has(b.projetId)).map((b) => [b.id, b]));
  const clientById = new Map(
    (await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) })).map((c) => [c.id, c]),
  );
  const userById = new Map((await db.query.users.findMany({ where: eq(users.promoteurId, session.promoteurId!) })).map((u) => [u.id, u]));

  const rows = (await db.query.desistements.findMany({ orderBy: [desc(desistements.createdAt)] })).filter((d) =>
    bienById.has(d.bienId),
  );
  const enCours = rows.filter((d) => d.statut !== "REMBOURSE");
  const clos = rows.filter((d) => d.statut === "REMBOURSE");

  const carte = (d: Ligne) => {
    const bien = bienById.get(d.bienId);
    const client = clientById.get(d.clientId);
    const commercial = d.commercialId ? userById.get(d.commercialId) : null;
    return (
      <Card key={d.id} accent={ACCENTS[d.statut]} className="p-5" data-testid="desistement-carte">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-h3 text-navy-900">
              {bien ? (
                <Link href={`/dashboard/biens/${bien.id}`} className="rounded-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
                  {bien.designation}
                </Link>
              ) : (
                "—"
              )}
            </p>
            <p className="mt-0.5 text-small text-navy-400">
              {client ? (
                <Link href={`/dashboard/clients/${client.id}`} className="rounded-xs font-medium text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
                  <NomCompte compte={client} />
                </Link>
              ) : (
                "—"
              )}
              {client?.pieceNumero && ` · ${client.pieceType ?? "CIN"} ${client.pieceNumero}`}
              {commercial && (
                <>
                  {" · enregistré par "}
                  <NomCompte compte={commercial} />
                </>
              )}
              {" · "}
              {formatDate(d.createdAt)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge statut={d.statut} label={LABELS[d.statut]} tone={TONES[d.statut]} />
            <p className="text-caption text-navy-400">
              À rembourser : <span className="text-small font-semibold tabular text-navy-900">{formatMoney(d.montantARembourser)}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-caption">
          {d.documentUrl ? (
            <a href={d.documentUrl} target="_blank" rel="noreferrer" className={lien}>
              <Paperclip className="h-3.5 w-3.5" /> Document de désistement légalisé
            </a>
          ) : (
            <span className="font-medium text-danger-fg">Document manquant</span>
          )}
          {client?.pieceDocUrl && (
            <a href={client.pieceDocUrl} target="_blank" rel="noreferrer" className={lien}>
              <Paperclip className="h-3.5 w-3.5" /> Pièce d&apos;identité du client
            </a>
          )}
          {d.verifiedAt && <span className="text-navy-400">Vérifié le {formatDate(d.verifiedAt)}</span>}
          {d.rembourseAt && <span className="text-navy-400">Remboursé le {formatDate(d.rembourseAt)}</span>}
          {d.dechargeNote && <span className="text-navy-400">Décharge : {d.dechargeNote}</span>}
        </div>
        {isRespAdm && d.statut === "EN_ATTENTE" && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-navy-50 pt-4">
            <VerifierButton desistementId={d.id} />
            <Callout tone="neutral" className="flex-1 py-1.5">
              Si le payeur diffère du client, exiger une décharge signée avant remboursement.
            </Callout>
          </div>
        )}
        {isRespAdm && d.statut === "VERIFIE" && (
          <div className="mt-4 border-t border-navy-50 pt-4">
            <RembourserForm desistementId={d.id} />
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Désistements"
        description="Vérification des papiers du client puis organisation du remboursement avec le Directeur Financier."
      />

      <Section title="À traiter" count={enCours.length} countTone={enCours.length > 0 ? "warning" : "neutral"} testId="desistements-a-traiter">
        {enCours.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Aucun désistement en attente" description="Quand un commercial enregistre un désistement, il apparaîtra ici." />
        ) : (
          <div className="space-y-4">{enCours.map(carte)}</div>
        )}
      </Section>

      {clos.length > 0 && (
        <Section title="Historique" count={clos.length} testId="desistements-historique">
          <div className="space-y-4">{clos.map(carte)}</div>
        </Section>
      )}

      {rows.length === 0 && (
        <p className="sr-only">
          <UserRoundX className="inline h-4 w-4" /> Aucun désistement enregistré.
        </p>
      )}
    </div>
  );
}
