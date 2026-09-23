import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FileDown, Paperclip, Send, CalendarClock, Receipt, Pencil } from "lucide-react";
import { db } from "@/db/client";
import { biens, projets, clients, paiements } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";
import { Card, EmptyState, Info, PageHeader, Section, Callout, Breadcrumb } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { LinkButton } from "@/components/ui/Button";
import { formatMoney, formatDate, STATUT_BIEN_LABELS, STATUT_BIEN_TONES } from "@/lib/utils";
import { NomCompte } from "@/components/ui/EtatCompte";
import { echeancierDuBien } from "@/lib/paiements";
import { BlockBienForm, UnblockBienButton, PlanUploadForm } from "./BienActions";
import { DesistementForm } from "./DesistementForm";
import { saisirPaiementCommercial } from "./actions";
import { PlansBien } from "@/components/biens/PlansBien";
import { PaiementForm } from "@/components/paiements/PaiementForm";

const ECH_LABEL: Record<string, string> = { EN_ATTENTE: "En attente", PARTIELLE: "Partielle", PAYEE: "Payée" };
const ECH_TONE = { EN_ATTENTE: "warning", PARTIELLE: "info", PAYEE: "success" } as const;

export default async function BienDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffSession();

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, id) });
  if (!bien) notFound();
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet || projet.promoteurId !== session.promoteurId) notFound();

  const client = bien.clientId ? await db.query.clients.findFirst({ where: eq(clients.id, bien.clientId) }) : null;
  const vendu = ["VENDU", "LIVRE"].includes(bien.statut);
  const echeancier = vendu ? await echeancierDuBien(bien.id) : [];
  // Paiements du client actuel uniquement (l'historique d'un ancien client désisté reste dans « Biens désistés »)
  const listePaiements =
    vendu && bien.clientId
      ? await db.query.paiements.findMany({
          where: and(eq(paiements.bienId, bien.id), eq(paiements.clientId, bien.clientId)),
          orderBy: [desc(paiements.createdAt)],
        })
      : [];

  const canPropose =
    ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && bien.statut === "DISPONIBLE";
  const isCommercialDuBien =
    (session.role === "COMMERCIAL" && bien.commercialId === session.userId) || session.role === "RESPONSABLE_COMMERCIAL";
  const canSaisirPaiement = vendu && isCommercialDuBien;

  const totalPaye = echeancier.reduce((s, e) => s + e.montantPaye, 0);
  const avancement = bien.prix > 0 ? Math.min(100, Math.round((totalPaye / bien.prix) * 100)) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Breadcrumb
          items={[
            { label: "Projets", href: "/dashboard/projets" },
            { label: projet.nom, href: `/dashboard/projets/${projet.id}` },
            { label: bien.designation },
          ]}
        />
        <PageHeader
          eyebrow={bien.nature}
          title={bien.designation}
          description={`${projet.nom} · ${bien.surface} m²`}
          action={
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                {session.role === "DIRECTEUR_COMMERCIAL" && bien.statut === "DISPONIBLE" && (
                  <LinkButton href={`/dashboard/biens/${bien.id}/modifier`} variant="secondary" size="sm" data-testid="modifier-bien">
                    <Pencil className="h-4 w-4" /> Modifier
                  </LinkButton>
                )}
                <StatusBadge statut={bien.statut} label={STATUT_BIEN_LABELS[bien.statut]} tone={STATUT_BIEN_TONES[bien.statut] ?? "neutral"} />
              </div>
              <p className="text-price text-navy-900">{formatMoney(bien.prix)}</p>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-5">
        <div className="space-y-4 sm:col-span-2">
          <Card className="overflow-hidden">
            <PlansBien
              plans={{ plan2dUrl: bien.plan2dUrl, plan3dUrl: bien.plan3dUrl, visiteVirtuelleUrl: bien.visiteVirtuelleUrl }}
              designation={bien.designation}
            />
          </Card>
          {session.role === "DIRECTEUR_COMMERCIAL" && (
            <Card className="p-4">
              <PlanUploadForm bienId={bien.id} plans={{ plan2dUrl: bien.plan2dUrl, plan3dUrl: bien.plan3dUrl, visiteVirtuelleUrl: bien.visiteVirtuelleUrl }} />
            </Card>
          )}
        </div>

        <div className="space-y-4 sm:col-span-3">
          <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-5">
            <Info label="Prix" value={<span className="text-h2 tabular">{formatMoney(bien.prix)}</span>} />
            <Info label="Surface" value={<span className="text-h2 tabular">{bien.surface} m²</span>} />
            <Info label="Nature" value={bien.nature} />
            <Info
              label="Client"
              value={
                client ? (
                  <Link
                    href={`/dashboard/clients/${client.id}`}
                    className="rounded-xs font-medium text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    <NomCompte compte={client} />
                  </Link>
                ) : undefined
              }
            />
            {client?.telephone1 && <Info label="Téléphone" value={<span className="tabular">{client.telephone1}</span>} />}
          </Card>

          {bien.statut === "PROPOSITION_EN_COURS" && (
            <Callout
              tone="info"
              title="Proposition en cours d'examen par le PDG"
              action={
                <Link href="/dashboard/propositions" className="text-small font-medium underline-offset-2 hover:underline">
                  Voir les propositions
                </Link>
              }
            />
          )}

          {bien.statut === "BLOQUE_PDG" && session.role === "PDG" && (
            <Card accent="warning" className="p-5">
              <Info label="Votre commentaire privé" value={bien.pdgCommentaire} />
              <div className="mt-4">
                <UnblockBienButton bienId={bien.id} />
              </div>
            </Card>
          )}

          {bien.statut === "BLOQUE_PDG" && session.role !== "PDG" && (
            <Callout tone="warning">Ce bien a été retiré de la vente par la direction et n&apos;est pas modifiable.</Callout>
          )}

          {session.role === "PDG" && bien.statut === "DISPONIBLE" && <BlockBienForm bienId={bien.id} />}

          {canPropose && (
            <LinkButton href={`/dashboard/propositions/nouvelle?bienId=${bien.id}`} variant="gold">
              <Send className="h-4 w-4" /> Envoyer une proposition
            </LinkButton>
          )}

          {bien.statut === "VENDU" && isCommercialDuBien && client && (
            <DesistementForm bienId={bien.id} clientNom={`${client.prenom} ${client.nom}`} />
          )}
        </div>
      </div>

      {vendu && (
        <Section
          title="Échéancier de paiement"
          description={echeancier.length > 0 ? `${formatMoney(totalPaye)} payés sur ${formatMoney(bien.prix)}` : undefined}
          action={
            echeancier.length > 0 ? (
              <div className="w-40">
                <div className="flex justify-between text-caption text-navy-400">
                  <span>Encaissé</span>
                  <span className="tabular font-medium text-navy-900">{avancement}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-navy-50">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${avancement}%` }} />
                </div>
              </div>
            ) : undefined
          }
        >
          <DataTable
            testId="table-echeancier"
            caption="Échéancier de paiement"
            minWidth={520}
            columns={[
              { header: "Tranche" },
              { header: "Montant", align: "right" },
              { header: "Payé", align: "right", hideBelow: "sm" },
              { header: "Échéance", hideBelow: "md" },
              { header: "Statut" },
            ]}
            rows={echeancier.map((e) => ({
              key: e.id,
              testId: "ligne-echeance",
              cells: [
                <span key="t" className="font-medium">
                  Tranche {e.numero} · {e.pourcentage}%
                </span>,
                <span key="m" className="tabular">
                  {formatMoney(e.montant)}
                </span>,
                <span key="p" className="tabular text-navy-400">
                  {formatMoney(e.montantPaye)}
                </span>,
                <span key="d" className="tabular text-navy-400">
                  {formatDate(e.dateEcheance)}
                </span>,
                <StatusBadge key="s" statut={e.statut} label={ECH_LABEL[e.statut] ?? e.statut} tone={ECH_TONE[e.statut as keyof typeof ECH_TONE] ?? "neutral"} />,
              ],
            }))}
            empty={{
              title: "Échéancier non disponible",
              description: "Aucune tranche n'a été définie pour cette vente.",
              icon: <CalendarClock />,
            }}
          />
        </Section>
      )}

      {vendu && (
        <Section title="Paiements" count={listePaiements.length > 0 ? listePaiements.length : undefined}>
          {listePaiements.length === 0 ? (
            <EmptyState icon={<Receipt />} title="Aucun paiement saisi" />
          ) : (
            <Card className="divide-y divide-navy-50">
              {listePaiements.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small" data-testid="ligne-paiement">
                  <div>
                    <p className="font-medium text-navy-900">
                      <span className="tabular">{formatMoney(p.montantExact ?? p.montant, p.devise)}</span>
                      {p.trancheNumero && <span className="ml-2 text-caption font-normal text-navy-400">Tranche {p.trancheNumero}</span>}
                    </p>
                    <p className="text-caption text-navy-400">
                      {p.natureOperation} · {p.banque} · {formatDate(p.dateOperation)}
                      {p.reference && ` · réf. ${p.reference}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.preuveUrl && (
                      <a
                        href={p.preuveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                      >
                        <Paperclip className="h-3.5 w-3.5" /> Preuve
                      </a>
                    )}
                    {p.recuPdfUrl && (
                      <a
                        href={p.recuPdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                      >
                        <FileDown className="h-3.5 w-3.5" /> Reçu
                      </a>
                    )}
                    <StatusBadge
                      statut={p.statut}
                      label={p.statut === "VALIDE" ? "Validé" : "En attente comptable"}
                      tone={p.statut === "VALIDE" ? "success" : "warning"}
                    />
                  </div>
                </div>
              ))}
            </Card>
          )}

          {canSaisirPaiement && (
            <Card className="p-5">
              <h3 className="text-h3 text-navy-900">Saisir un encaissement</h3>
              <p className="mb-5 mt-1 text-caption text-navy-400">
                Première tranche (avance) ou tranche suivante réglée auprès de vous. Le Comptable Interne complétera la
                référence et validera l&apos;opération.
              </p>
              <PaiementForm action={saisirPaiementCommercial} bienId={bien.id} echeances={echeancier} />
            </Card>
          )}
        </Section>
      )}
    </div>
  );
}
