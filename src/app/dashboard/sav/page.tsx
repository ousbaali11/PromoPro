import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { FileDown, DoorOpen, Camera, PackageCheck, Building, Hammer } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { syndics, clients, visites, projets, demandesPhotos, demandesTma } from "@/db/schema";
import { EmptyState, Card, Badge, PageHeader, Section, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { formatMoney, formatDate, formatDateTime } from "@/lib/utils";
import { NomCompte } from "@/components/ui/EtatCompte";
import { RendezVousSection } from "@/app/dashboard/rendez-vous/RendezVousSection";
import { VisiteActions } from "./VisiteActions";
import { DeposerPhotosForm } from "./DeposerPhotosForm";
import { ConfirmerLivraisonButton, DefinirSyndicForm } from "./LivraisonSyndicActions";
import { TmaCarte } from "@/components/dossier/cartes";
import { lienFicheClient } from "@/lib/dossier-client";

const SYNDIC_STATUT: Record<string, { label: string; tone: Tone }> = {
  A_PAYER: { label: "À payer", tone: "warning" },
  EN_ATTENTE_VALIDATION: { label: "En attente de validation comptable", tone: "info" },
  PAYE: { label: "Payé", tone: "success" },
};

const VISITE_STATUT: Record<string, { label: string; tone: Tone }> = {
  DEMANDEE: { label: "À traiter", tone: "warning" },
  ACCEPTEE: { label: "Acceptée — créneau à choisir par le client", tone: "info" },
  PLANIFIEE: { label: "Planifiée", tone: "success" },
  REFUSEE: { label: "Refusée", tone: "danger" },
};

const lien =
  "inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus";
const lienTitre = "rounded-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus";

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
  const biensAvecClient = [...bienById.values()].filter((b) => b.clientId && ["VENDU", "LIVRE"].includes(b.statut));
  const biensVendus = biensAvecClient.filter((b) => b.statut === "VENDU");
  const biensLivres = biensAvecClient.filter((b) => b.statut === "LIVRE");

  const demandes = clientIds.length
    ? await db.query.demandesPhotos.findMany({ where: inArray(demandesPhotos.clientId, clientIds), orderBy: [desc(demandesPhotos.createdAt)] })
    : [];
  const demandesEnAttente = demandes.filter((d) => d.statut === "EN_ATTENTE");

  // Travaux modificatifs acquéreurs : à chiffrer d'abord, puis en cours, puis clôturées (récentes)
  const ORDRE_TMA: Record<string, number> = { DEMANDE: 0, CHIFFRE: 1, SIGNE: 2, EN_COURS: 3, TERMINE: 4, REFUSE: 5 };
  const listeTma = clientIds.length
    ? (await db.query.demandesTma.findMany({ where: inArray(demandesTma.clientId, clientIds), orderBy: [desc(demandesTma.createdAt)] })).sort(
        (a, b) => (ORDRE_TMA[a.statut] ?? 9) - (ORDRE_TMA[b.statut] ?? 9),
      )
    : [];
  const tmaAChiffrer = listeTma.filter((d) => d.statut === "DEMANDE").length;
  const demandesTraitees = demandes.filter((d) => d.statut === "TRAITEE").slice(0, 10);
  const photosParDemande = new Map<string, number>();
  for (const p of await db.query.photosAvancement.findMany()) {
    if (p.demandeId) photosParDemande.set(p.demandeId, (photosParDemande.get(p.demandeId) ?? 0) + 1);
  }

  const visiteLigne = (v: (typeof listeVisites)[number]) => {
    const client = clientById.get(v.clientId);
    const bien = bienById.get(v.bienId);
    const s = VISITE_STATUT[v.statut];
    return (
      <div key={v.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" data-testid="visite-ligne">
        <div className="min-w-0">
          <p className="font-medium text-navy-900">
            {bien ? (
              <Link href={`/dashboard/biens/${bien.id}`} className={lienTitre}>
                {bien.designation}
              </Link>
            ) : (
              "—"
            )}
            {bien && <span className="ml-2 text-caption font-normal text-navy-400">{projetById.get(bien.projetId)?.nom}</span>}
          </p>
          <p className="text-caption text-navy-400">
            <NomCompte compte={client} />
            {client?.telephone1 && <span className="tabular"> · {client.telephone1}</span>} · demandé le {formatDate(v.createdAt)}
            {v.dateVisite && ` · visite le ${formatDateTime(v.dateVisite)}`}
          </p>
          {v.motifRefus && <p className="mt-1 text-caption text-navy-400">Motif : {v.motifRefus}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge statut={v.statut} label={s.label} tone={s.tone} />
          {v.autorisationUrl && (
            <a href={v.autorisationUrl} target="_blank" rel="noreferrer" className={lien}>
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

      <Section title="Rendez-vous" testId="section-rendez-vous">
        <RendezVousSection service="SAV" session={session} canAct={isSav} />
      </Section>

      <Section
        title="Demandes de visite"
        count={visitesATraiter.length}
        countTone={visitesATraiter.length > 0 ? "warning" : "neutral"}
        testId="section-visites"
      >
        {listeVisites.length === 0 ? (
          <EmptyState icon={<DoorOpen />} title="Aucune demande de visite" description="Les demandes formulées par les clients apparaîtront ici." />
        ) : (
          <div className="space-y-4">
            {visitesATraiter.length > 0 && (
              <Card accent="warning" className="divide-y divide-navy-50">
                {visitesATraiter.map(visiteLigne)}
              </Card>
            )}
            {visitesAutres.length > 0 && <Card className="divide-y divide-navy-50">{visitesAutres.map(visiteLigne)}</Card>}
          </div>
        )}
      </Section>

      <Section
        title="Demandes de photos d'avancement"
        count={demandesEnAttente.length}
        countTone={demandesEnAttente.length > 0 ? "warning" : "neutral"}
        testId="section-photos"
      >
        {demandes.length === 0 ? (
          <EmptyState icon={<Camera />} title="Aucune demande de photos" description="Les demandes des clients (une par bien tous les 6 mois) apparaîtront ici." />
        ) : (
          <Card className="divide-y divide-navy-50">
            {[...demandesEnAttente, ...demandesTraitees].map((d) => {
              const client = clientById.get(d.clientId);
              const bien = bienById.get(d.bienId);
              return (
                <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" data-testid="demande-photos">
                  <div className="min-w-0">
                    <p className="font-medium text-navy-900">
                      {bien ? (
                        <Link href={`/dashboard/biens/${bien.id}`} className={lienTitre}>
                          {bien.designation}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {bien && <span className="ml-2 text-caption font-normal text-navy-400">{projetById.get(bien.projetId)?.nom}</span>}
                    </p>
                    <p className="text-caption text-navy-400">
                      <NomCompte compte={client} /> · demandé le {formatDate(d.createdAt)}
                      {d.traiteAt && ` · ${photosParDemande.get(d.id) ?? 0} photo(s) déposée(s) le ${formatDate(d.traiteAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {d.statut === "EN_ATTENTE" ? (
                      isSav ? (
                        <DeposerPhotosForm demandeId={d.id} />
                      ) : (
                        <StatusBadge statut="EN_ATTENTE" label="En attente" tone="warning" />
                      )
                    ) : (
                      <StatusBadge statut="TRAITEE" label="Traitée" tone="success" />
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="Livraisons" count={biensVendus.length + biensLivres.length || undefined} testId="section-livraisons">
        {biensVendus.length === 0 && biensLivres.length === 0 ? (
          <EmptyState icon={<PackageCheck />} title="Aucun bien vendu" description="Les biens vendus apparaîtront ici pour confirmation de livraison." />
        ) : (
          <Card className="divide-y divide-navy-50">
            {[...biensVendus, ...biensLivres].map((b) => {
              const client = b.clientId ? clientById.get(b.clientId) : null;
              return (
                <div key={b.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" data-testid="livraison-ligne">
                  <div className="min-w-0">
                    <p className="font-medium text-navy-900">
                      <Link href={`/dashboard/biens/${b.id}`} className={lienTitre}>
                        {b.designation}
                      </Link>
                      <span className="ml-2 text-caption font-normal text-navy-400">{projetById.get(b.projetId)?.nom}</span>
                    </p>
                    <p className="text-caption text-navy-400">
                      <NomCompte compte={client} />
                      {b.livreAt && ` · livré le ${formatDate(b.livreAt)}`}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Badge tone={b.livraisonConfirmeeClient ? "success" : "neutral"}>Client {b.livraisonConfirmeeClient ? "✓" : "—"}</Badge>
                      <Badge tone={b.livraisonConfirmeeSav ? "success" : "neutral"}>SAV {b.livraisonConfirmeeSav ? "✓" : "—"}</Badge>
                    </div>
                  </div>
                  <div>
                    {b.statut === "LIVRE" ? (
                      <StatusBadge statut="LIVRE" label="Livré" tone="success" />
                    ) : isSav && !b.livraisonConfirmeeSav ? (
                      <ConfirmerLivraisonButton bienId={b.id} />
                    ) : (
                      <StatusBadge statut="ATTENTE_CLIENT" label="En attente du client" tone="warning" />
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </Section>

      <Section
        title="Travaux modificatifs acquéreurs"
        count={tmaAChiffrer || undefined}
        countTone="warning"
        description="Demandes de modification des clients : chiffrage, devis et suivi des travaux se font depuis la fiche du client (onglet Travaux modificatifs)."
        testId="section-tma"
      >
        {listeTma.length === 0 ? (
          <Card>
            <EmptyState icon={<Hammer />} title="Aucune demande de modification" description="Les clients peuvent en déposer depuis leur espace, dans le délai fixé par projet." />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {listeTma.map((d) => (
              <TmaCarte
                key={d.id}
                demande={d}
                bien={bienById.get(d.bienId)}
                client={clientById.get(d.clientId)}
                lienFiche={clientById.has(d.clientId) ? lienFicheClient(d.clientId, d.bienId, "tma") : undefined}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Syndic obligatoire (2 ans)" count={listeSyndics.length || undefined} className="space-y-4" testId="section-syndic">
        {isSav && biensAvecClient.length > 0 && (
          <DefinirSyndicForm
            biens={biensAvecClient.map((b) => {
              const c = b.clientId ? clientById.get(b.clientId) : null;
              return { id: b.id, label: `${b.designation} — ${c ? `${c.prenom} ${c.nom}` : "?"}` };
            })}
          />
        )}
        <DataTable
          testId="table-syndics"
          caption="Syndic par bien"
          minWidth={560}
          columns={[
            { header: "Bien", sortable: true },
            { header: "Client", hideBelow: "sm" },
            { header: "Montant", align: "right", sortable: true },
            { header: "Période", hideBelow: "md" },
            { header: "Statut", sortable: true },
          ]}
          rows={listeSyndics.map((s) => {
            const client = clientById.get(s.clientId);
            const bien = bienById.get(s.bienId);
            const st = SYNDIC_STATUT[s.statut];
            return {
              key: s.id,
              testId: "syndic-ligne",
              sort: [bien?.designation ?? "", null, s.montant, null, st?.label ?? s.statut],
              cells: [
                <span key="bien" className="font-medium">
                  {bien?.designation ?? "—"}
                </span>,
                <span key="client" className="text-navy-400">
                  <NomCompte compte={client} />
                </span>,
                <span key="montant" className="tabular">
                  {formatMoney(s.montant)}
                </span>,
                <span key="periode" className="text-navy-400">
                  {s.periode ?? "—"}
                </span>,
                <StatusBadge key="statut" statut={s.statut} label={st?.label ?? s.statut} tone={st?.tone ?? "neutral"} />,
              ],
            };
          })}
          empty={{ icon: <Building />, title: "Aucun syndic défini", description: "Définissez le montant dû par chaque client ; il sera notifié." }}
        />
      </Section>
    </div>
  );
}
