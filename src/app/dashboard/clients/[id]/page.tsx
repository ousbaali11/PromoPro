import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FileText, Home, Pencil } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { clients, users } from "@/db/schema";
import { Card, Info, PageHeader, Section, EmptyState, Breadcrumb, Callout } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { LinkButton } from "@/components/ui/Button";
import { formatDate, formatMoney, STATUT_BIEN_LABELS, STATUT_BIEN_TONES } from "@/lib/utils";
import { ResetPasswordButton } from "../ResetPasswordButton";
import { EtatCompte, NomCompte } from "@/components/ui/EtatCompte";
import { ActionsCompte } from "@/components/comptes/ActionsCompte";
import { etatCompte, peutGererClient, peutModifierClient } from "@/lib/comptes";
import { clientAUneVenteEnCours } from "@/lib/comptes-service";
import { biensDuClient, chargerDossierBien, lireOnglet, ONGLETS, ONGLET_LABELS } from "@/lib/dossier-client";
import { OngletContrat } from "./OngletContrat";
import { OngletPaiements } from "./OngletPaiements";
import { OngletTma } from "./OngletTma";
import { OngletDocuments } from "./OngletDocuments";

/**
 * Fiche client : point d'entrée unique de gestion d'un client. Un sélecteur
 * de bien (s'il en a plusieurs, ou s'il s'est désisté de l'un d'eux), puis
 * quatre onglets pour le bien sélectionné — Contrat, Échéancier & Paiements,
 * Travaux modificatifs, Documents. Les pages Contrats, Paiements,
 * Désistements et SAV ne sont que des index : toute action se fait ici, sur
 * UN client et UN bien à la fois.
 */
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bien?: string; onglet?: string }>;
}) {
  const { id } = await params;
  const { bien: bienParam, onglet: ongletParam } = await searchParams;
  const session = await requireStaffSession();

  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client || client.promoteurId !== session.promoteurId) notFound();

  // Un commercial ne voit que ses propres clients
  if (["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && client.commercialId !== session.userId) {
    notFound();
  }

  const commercial = client.commercialId
    ? await db.query.users.findFirst({ where: eq(users.id, client.commercialId) })
    : null;
  const mesBiens = await biensDuClient(client);
  const selection = mesBiens.find((b) => b.bien.id === bienParam) ?? mesBiens[0];
  const onglet = lireOnglet(ongletParam);
  const dossier = selection ? await chargerDossierBien(client, selection.bien) : null;

  const canReset = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && etatCompte(client) === "actif";
  const peutGerer = peutGererClient(session, client);
  const peutModifier = peutModifierClient(session, client) && etatCompte(client) === "actif";
  const venteEnCours = peutGerer ? await clientAUneVenteEnCours(client.id) : false;
  const initiales = `${client.prenom[0] ?? ""}${client.nom[0] ?? ""}`.toUpperCase();
  const lienOnglet = (bienId: string, o: string) => `/dashboard/clients/${client.id}?bien=${bienId}&onglet=${o}`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Clients", href: "/dashboard/clients" }, { label: `${client.prenom} ${client.nom}` }]} />
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-small font-semibold text-gold ring-4 ring-navy-50">
            {initiales}
          </span>
          <div className="min-w-0 flex-1">
            <PageHeader
              eyebrow="Client"
              title={`${client.prenom} ${client.nom}`}
              description={`Identifiant ${client.identifiant} · créé le ${formatDate(client.createdAt)}`}
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <EtatCompte compte={client} />
                  {peutModifier && (
                    <LinkButton href={`/dashboard/clients/${client.id}/modifier`} variant="secondary" size="sm" data-testid="modifier-client">
                      <Pencil className="h-4 w-4" /> Modifier
                    </LinkButton>
                  )}
                  {canReset && <ResetPasswordButton clientId={client.id} />}
                  {peutGerer && (
                    <ActionsCompte
                      type="client"
                      id={client.id}
                      nom={`${client.prenom} ${client.nom}`}
                      etat={etatCompte(client)}
                      venteEnCours={venteEnCours}
                      compact
                    />
                  )}
                </div>
              }
            />
          </div>
        </div>
      </div>

      {etatCompte(client) === "supprime" && (
        <Callout tone="neutral" title="Compte supprimé" testId="bandeau-supprime">
          Ce client n&apos;apparaît plus dans la liste active et ne peut plus se connecter ; son historique (ventes, paiements,
          propositions) reste intact. Réactivez le compte pour revenir en arrière.
        </Callout>
      )}
      {etatCompte(client) === "suspendu" && (
        <Callout tone="warning" title="Compte suspendu" testId="bandeau-suspendu">
          Ce client ne peut plus se connecter à son espace ; ses données restent visibles. Réactivez le compte pour lever la suspension.
        </Callout>
      )}

      <Card className="grid grid-cols-1 gap-x-4 gap-y-5 p-5 sm:grid-cols-2">
        <Info label="Date de naissance" value={client.dateNaissance} />
        <Info label="Lieu de naissance" value={client.lieuNaissance} />
        <Info label="Adresse" value={client.adresse} className="sm:col-span-2" />
        <Info label="Pièce d'identité" value={<span className="font-mono">{`${client.pieceType ?? "CIN"} ${client.pieceNumero ?? ""}`.trim()}</span>} />
        <Info
          label="Scan de la pièce"
          value={
            client.pieceDocUrl ? (
              <a
                href={client.pieceDocUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xs font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                <FileText className="h-4 w-4" /> Ouvrir le document
              </a>
            ) : (
              <span className="text-navy-400">Aucun document importé.</span>
            )
          }
        />
        <Info label="Téléphone 1" value={<span className="tabular">{client.telephone1}</span>} />
        <Info label="Téléphone 2" value={client.telephone2 ? <span className="tabular">{client.telephone2}</span> : undefined} />
        <Info label="E-mail" value={client.email} />
        <Info label="Commercial" value={commercial ? <NomCompte compte={commercial} /> : undefined} />
      </Card>

      <Section
        title="Dossier par bien"
        count={mesBiens.length > 0 ? mesBiens.length : undefined}
        description={mesBiens.length > 1 ? "Sélectionnez un bien : chaque onglet ne montre que ce qui le concerne." : undefined}
        testId="section-dossier"
      >
        {!selection || !dossier ? (
          <EmptyState icon={<Home />} title="Aucun bien affecté" description="Les biens vendus à ce client apparaîtront ici." className="py-10" />
        ) : (
          <div className="space-y-4">
            {mesBiens.length > 1 && (
              <SegmentedControl
                ariaLabel="Biens du client"
                testId="selecteur-biens-client"
                value={selection.bien.id}
                items={mesBiens.map((b) => ({
                  value: b.bien.id,
                  label: b.desiste ? `${b.bien.designation} (désisté)` : b.bien.designation,
                  href: lienOnglet(b.bien.id, onglet),
                }))}
              />
            )}

            <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small" data-testid="client-bien" data-bien-id={selection.bien.id}>
              <div className="min-w-0">
                <Link
                  href={`/dashboard/biens/${selection.bien.id}`}
                  className="rounded-xs font-medium text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                  data-testid="bien-selectionne"
                >
                  {selection.bien.designation}
                </Link>
                <p className="text-caption text-navy-400">
                  {selection.projet?.nom}
                  {selection.desiste && " · client désisté de ce bien"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular text-navy-400">{formatMoney(selection.bien.prix)}</span>
                <StatusBadge
                  statut={selection.bien.statut}
                  label={STATUT_BIEN_LABELS[selection.bien.statut]}
                  tone={STATUT_BIEN_TONES[selection.bien.statut] ?? "neutral"}
                />
              </div>
            </Card>

            <SegmentedControl
              ariaLabel="Onglets du dossier"
              testId="onglets-dossier"
              size="sm"
              value={onglet}
              items={ONGLETS.map((o) => ({ value: o, label: ONGLET_LABELS[o], href: lienOnglet(selection.bien.id, o) }))}
            />

            <div data-testid={`onglet-${onglet}`}>
              {onglet === "contrat" && <OngletContrat session={session} client={client} selection={selection} dossier={dossier} />}
              {onglet === "paiements" && <OngletPaiements session={session} client={client} selection={selection} dossier={dossier} />}
              {onglet === "tma" && <OngletTma session={session} client={client} selection={selection} dossier={dossier} />}
              {onglet === "documents" && <OngletDocuments client={client} selection={selection} dossier={dossier} />}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
