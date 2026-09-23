import Link from "next/link";
import { NomCompte } from "@/components/ui/EtatCompte";
import { desc, eq } from "drizzle-orm";
import { FileDown, FileCheck2, FileSignature, PackageCheck, Landmark } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { contrats, projets, clients } from "@/db/schema";
import { Card, Badge, EmptyState, PageHeader, Section, Stat, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
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
const TONES: Record<string, Tone> = {
  EN_ATTENTE: "warning",
  PRET: "info",
  ENVOYE: "navy",
  SIGNE: "success",
  ANNULE: "neutral",
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
  const aTransmettre = biensLivres.filter((b) => !b.notaireTransmisAt).length;

  return (
    <div className="space-y-8">
      <PageHeader title="Contrats" description="Contrats à vérifier, désistements à traiter et dossiers à transmettre au notaire." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Contrats en attente" value={enAttente} tone={enAttente > 0 ? "warning" : undefined} icon={<FileSignature />} hint="À vérifier puis confirmer" />
        <Stat
          label="Désistements à traiter"
          value={desistementsEnAttente}
          tone={desistementsEnAttente > 0 ? "danger" : undefined}
          icon={<PackageCheck />}
          hint={
            <Link href="/dashboard/desistements" className="font-medium text-gold-600 underline-offset-2 hover:underline">
              Voir les désistements
            </Link>
          }
        />
        <Stat label="Dossiers à transmettre au notaire" value={aTransmettre} tone={aTransmettre > 0 ? "info" : undefined} icon={<Landmark />} />
      </div>

      <Section title="Contrats" count={rows.length > 0 ? rows.length : undefined} testId="section-contrats">
        <DataTable
          testId="table-contrats"
          caption="Contrats de vente"
          exportation={{ nom: "contrats", entetes: ["Bien", "Client", "Statut", "Contrat PDF", "Copie signée"] }}
          columns={[
            { header: "Bien", sortable: true },
            { header: "Client", hideBelow: "sm" },
            { header: "Statut", sortable: true },
            { header: <span className="sr-only">Actions</span>, align: "right" },
          ]}
          rows={rows.map(({ contrat, bien, client }) => ({
            key: contrat.id,
            testId: "contrat-ligne",
            accent: contrat.statut === "EN_ATTENTE" ? "warning" : undefined,
            muted: contrat.statut === "ANNULE",
            sort: [bien.designation, null, LABELS[contrat.statut], null],
            export: [bien.designation, client ? `${client.prenom} ${client.nom}` : "", LABELS[contrat.statut], !!contrat.pdfUrl, !!contrat.copieSigneeUrl],
            cells: [
              <Link
                key="bien"
                href={`/dashboard/biens/${bien.id}`}
                className="rounded-xs font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                {bien.designation}
              </Link>,
              client ? (
                <Link
                  key="client"
                  href={`/dashboard/clients/${client.id}`}
                  className="rounded-xs text-navy-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <NomCompte compte={client} />
                </Link>
              ) : (
                "—"
              ),
              <StatusBadge key="statut" statut={contrat.statut} label={LABELS[contrat.statut]} tone={TONES[contrat.statut]} />,
              <span key="actions" className="inline-flex flex-wrap items-center justify-end gap-3">
                {contrat.pdfUrl && (
                  <a
                    href={contrat.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    <FileDown className="h-3.5 w-3.5" /> Contrat PDF
                  </a>
                )}
                {contrat.copieSigneeUrl && (
                  <a
                    href={contrat.copieSigneeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" /> Copie signée
                  </a>
                )}
                {contrat.statut === "EN_ATTENTE" && isRespAdm && <ConfirmerButton contratId={contrat.id} />}
                {["PRET", "ENVOYE"].includes(contrat.statut) && isRespAdm && <CopieSigneeForm contratId={contrat.id} />}
              </span>,
            ],
          }))}
          empty={{
            icon: <FileSignature />,
            title: "Aucun contrat",
            description: "Les contrats apparaissent dès qu'une vente est validée par le PDG.",
          }}
        />
      </Section>

      <Section
        title="Biens livrés — dossiers à transmettre au notaire"
        count={biensLivres.length > 0 ? biensLivres.length : undefined}
        testId="section-biens-livres"
      >
        {biensLivres.length === 0 ? (
          <EmptyState
            icon={<PackageCheck />}
            title="Aucun bien livré"
            description="Un bien apparaît ici quand le client et le SAV ont tous deux confirmé la livraison."
          />
        ) : (
          <Card className="divide-y divide-navy-50">
            {biensLivres.map((b) => {
              const client = b.clientId ? clientById.get(b.clientId) : null;
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" data-testid="bien-livre">
                  <div>
                    <p className="font-medium text-navy-900">
                      <Link
                        href={`/dashboard/biens/${b.id}`}
                        className="rounded-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                      >
                        {b.designation}
                      </Link>
                      <span className="ml-2 text-caption font-normal text-navy-400">{projetById.get(b.projetId)?.nom}</span>
                    </p>
                    <p className="text-caption text-navy-400">
                      <NomCompte compte={client} /> · livré le {formatDate(b.livreAt)}
                    </p>
                  </div>
                  {b.notaireTransmisAt ? (
                    <Badge tone="success" dot>
                      Transmis au notaire le {formatDate(b.notaireTransmisAt)}
                    </Badge>
                  ) : isRespAdm ? (
                    <NotaireButton bienId={b.id} />
                  ) : (
                    <Badge tone="warning" dot>
                      À transmettre
                    </Badge>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </Section>

      {isRespAdm && (
        <Section title="Rendez-vous (service administratif)" testId="section-rendez-vous">
          <RendezVousSection service="ADMINISTRATIF" session={session} canAct />
        </Section>
      )}
    </div>
  );
}
