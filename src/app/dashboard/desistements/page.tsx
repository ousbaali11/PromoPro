import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Paperclip } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { desistements, biens, projets, clients, users } from "@/db/schema";
import { Card, Badge, EmptyState, PageHeader } from "@/components/ui/Primitives";
import { formatDate, formatMoney } from "@/lib/utils";
import { VerifierButton, RembourserForm } from "./DesistementActions";

const LABELS: Record<string, string> = { EN_ATTENTE: "À vérifier", VERIFIE: "Vérifié — remboursement en cours", REMBOURSE: "Remboursé" };
const COLORS: Record<string, string> = {
  EN_ATTENTE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  VERIFIE: "bg-sky-50 text-sky-700 ring-sky-600/20",
  REMBOURSE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

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

  const Ligne = ({ d }: { d: (typeof rows)[number] }) => {
    const bien = bienById.get(d.bienId);
    const client = clientById.get(d.clientId);
    const commercial = d.commercialId ? userById.get(d.commercialId) : null;
    return (
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-navy-900">
              {bien ? (
                <Link href={`/dashboard/biens/${bien.id}`} className="hover:underline">
                  {bien.designation}
                </Link>
              ) : (
                "—"
              )}
            </p>
            <p className="text-xs text-navy-400">
              {client ? (
                <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                  {client.prenom} {client.nom}
                </Link>
              ) : (
                "—"
              )}
              {client?.pieceNumero && ` · ${client.pieceType ?? "CIN"} ${client.pieceNumero}`}
              {commercial && ` · enregistré par ${commercial.prenom} ${commercial.nom}`} · {formatDate(d.createdAt)}
            </p>
          </div>
          <div className="text-right">
            <Badge className={COLORS[d.statut]}>{LABELS[d.statut]}</Badge>
            <p className="mt-1 text-xs text-navy-400">À rembourser : <span className="font-medium text-navy-900">{formatMoney(d.montantARembourser)}</span></p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          {d.documentUrl ? (
            <a href={d.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-600 hover:underline">
              <Paperclip className="h-3.5 w-3.5" /> Document de désistement légalisé
            </a>
          ) : (
            <span className="text-rose-700">Document manquant</span>
          )}
          {client?.pieceDocUrl && (
            <a href={client.pieceDocUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-600 hover:underline">
              <Paperclip className="h-3.5 w-3.5" /> Pièce d&apos;identité du client
            </a>
          )}
          {d.verifiedAt && <span className="text-navy-400">Vérifié le {formatDate(d.verifiedAt)}</span>}
          {d.rembourseAt && <span className="text-navy-400">Remboursé le {formatDate(d.rembourseAt)}</span>}
          {d.dechargeNote && <span className="text-navy-400">Décharge : {d.dechargeNote}</span>}
        </div>
        {isRespAdm && d.statut === "EN_ATTENTE" && (
          <div className="mt-4 flex items-center gap-3">
            <VerifierButton desistementId={d.id} />
            <p className="text-xs text-navy-400">
              Si le payeur diffère du client, exiger une décharge signée avant remboursement.
            </p>
          </div>
        )}
        {isRespAdm && d.statut === "VERIFIE" && (
          <div className="mt-4">
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

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">
          À traiter{" "}
          <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
            {enCours.length}
          </span>
        </h2>
        {enCours.length === 0 ? (
          <EmptyState title="Aucun désistement en attente" description="Quand un commercial enregistre un désistement, il apparaîtra ici." />
        ) : (
          <div className="space-y-4">
            {enCours.map((d) => (
              <Ligne key={d.id} d={d} />
            ))}
          </div>
        )}
      </section>

      {clos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-navy-900">Historique</h2>
          <div className="space-y-4">
            {clos.map((d) => (
              <Ligne key={d.id} d={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
