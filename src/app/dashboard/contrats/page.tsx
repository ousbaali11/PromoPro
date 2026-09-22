import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileDown, FileCheck2 } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { contrats, biens, projets, clients, desistements } from "@/db/schema";
import { Card, Badge, EmptyState, PageHeader } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { ConfirmerButton } from "./ConfirmerButton";
import { CopieSigneeForm } from "./CopieSigneeForm";
import { NotaireButton } from "./NotaireButton";
import { RendezVousSection } from "@/app/dashboard/rendez-vous/RendezVousSection";

const LABELS: Record<string, string> = {
  EN_ATTENTE: "En attente",
  PRET: "Prêt",
  ENVOYE: "Envoyé",
  SIGNE: "Signé",
  ANNULE: "Annulé (désistement)",
};
const COLORS: Record<string, string> = {
  EN_ATTENTE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PRET: "bg-sky-50 text-sky-700 ring-sky-600/20",
  ENVOYE: "bg-navy/10 text-navy ring-navy/20",
  SIGNE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ANNULE: "bg-slate-100 text-slate-700 ring-slate-600/20",
};

/** Tableau de bord du Responsable Administratif (section 7.4) : contrats, désistements, biens livrés. */
export default async function ContratsPage() {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF", "PDG", "DIRECTEUR_COMMERCIAL"]);
  const isRespAdm = session.role === "RESPONSABLE_ADMINISTRATIF";

  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetById = new Map(allProjets.map((p) => [p.id, p]));
  const allBiens = (await db.query.biens.findMany()).filter((b) => projetById.has(b.projetId));
  const bienById = new Map(allBiens.map((b) => [b.id, b]));
  const clientById = new Map(
    (await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) })).map((c) => [c.id, c]),
  );

  const rows = (await db.query.contrats.findMany({ orderBy: [desc(contrats.createdAt)] }))
    .filter((c) => bienById.has(c.bienId))
    .map((c) => {
      const bien = bienById.get(c.bienId)!;
      const client = bien.clientId ? clientById.get(bien.clientId) : undefined;
      return { contrat: c, bien, client };
    });
  const enAttente = rows.filter((r) => r.contrat.statut === "EN_ATTENTE").length;

  const desistementsEnAttente = (await db.query.desistements.findMany()).filter(
    (d) => bienById.has(d.bienId) && d.statut !== "REMBOURSE",
  ).length;

  const biensLivres = allBiens.filter((b) => b.statut === "LIVRE").sort((a, b) => (b.livreAt?.getTime() ?? 0) - (a.livreAt?.getTime() ?? 0));

  return (
    <div className="space-y-8">
      <PageHeader title="Contrats" description="Contrats à vérifier, désistements à traiter et dossiers à transmettre au notaire." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-navy-400">Contrats en attente</p>
          <p className="mt-1 text-2xl font-semibold text-gold-600">{enAttente}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-navy-400">Désistements à traiter</p>
          <p className="mt-1 text-2xl font-semibold text-navy-900">{desistementsEnAttente}</p>
          <LinkButton href="/dashboard/desistements" variant="ghost" size="sm" className="mt-1 -ml-3">
            Voir →
          </LinkButton>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-navy-400">Dossiers à transmettre au notaire</p>
          <p className="mt-1 text-2xl font-semibold text-navy-900">{biensLivres.filter((b) => !b.notaireTransmisAt).length}</p>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">Contrats</h2>
        {rows.length === 0 ? (
          <EmptyState title="Aucun contrat" description="Les contrats apparaissent dès qu'une vente est validée par le PDG." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                  <th className="px-5 py-3 font-medium">Bien</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ contrat, bien, client }) => (
                  <tr key={contrat.id} className="border-b border-navy-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-900">
                      <Link href={`/dashboard/biens/${bien.id}`} className="hover:underline">
                        {bien.designation}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-navy-400">
                      {client ? (
                        <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                          {client.prenom} {client.nom}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge className={COLORS[contrat.statut]}>{LABELS[contrat.statut]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-3">
                        {contrat.pdfUrl && (
                          <a href={contrat.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline">
                            <FileDown className="h-3.5 w-3.5" /> Contrat PDF
                          </a>
                        )}
                        {contrat.copieSigneeUrl && (
                          <a href={contrat.copieSigneeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline">
                            <FileCheck2 className="h-3.5 w-3.5" /> Copie signée
                          </a>
                        )}
                        {contrat.statut === "EN_ATTENTE" && isRespAdm && <ConfirmerButton contratId={contrat.id} />}
                        {["PRET", "ENVOYE"].includes(contrat.statut) && isRespAdm && <CopieSigneeForm contratId={contrat.id} />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">Biens livrés — dossiers à transmettre au notaire</h2>
        {biensLivres.length === 0 ? (
          <EmptyState title="Aucun bien livré" description="Un bien apparaît ici quand le client et le SAV ont tous deux confirmé la livraison." />
        ) : (
          <Card className="divide-y divide-navy-50">
            {biensLivres.map((b) => {
              const client = b.clientId ? clientById.get(b.clientId) : null;
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-medium text-navy-900">
                      <Link href={`/dashboard/biens/${b.id}`} className="hover:underline">
                        {b.designation}
                      </Link>
                      <span className="ml-2 text-xs font-normal text-navy-400">{projetById.get(b.projetId)?.nom}</span>
                    </p>
                    <p className="text-xs text-navy-400">
                      {client ? `${client.prenom} ${client.nom}` : "—"} · livré le {formatDate(b.livreAt)}
                    </p>
                  </div>
                  {b.notaireTransmisAt ? (
                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Transmis au notaire le {formatDate(b.notaireTransmisAt)}</Badge>
                  ) : isRespAdm ? (
                    <NotaireButton bienId={b.id} />
                  ) : (
                    <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">À transmettre</Badge>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {isRespAdm && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-navy-900">Rendez-vous (service administratif)</h2>
          <RendezVousSection service="ADMINISTRATIF" session={session} canAct />
        </section>
      )}
    </div>
  );
}
