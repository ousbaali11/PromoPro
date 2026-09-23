import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FileText, Home, Pencil } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { clients, users, biens } from "@/db/schema";
import { Card, Info, PageHeader, Section, EmptyState, Breadcrumb, Callout } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LinkButton } from "@/components/ui/Button";
import { formatDate, formatMoney, STATUT_BIEN_LABELS, STATUT_BIEN_TONES } from "@/lib/utils";
import { ResetPasswordButton } from "../ResetPasswordButton";
import { EtatCompte, NomCompte } from "@/components/ui/EtatCompte";
import { ActionsCompte } from "@/components/comptes/ActionsCompte";
import { etatCompte, peutGererClient, peutModifierClient } from "@/lib/comptes";
import { clientAUneVenteEnCours } from "@/lib/comptes-service";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const mesBiens = await db.query.biens.findMany({ where: eq(biens.clientId, client.id) });
  const projetIds = [...new Set(mesBiens.map((b) => b.projetId))];
  const projetsList = projetIds.length ? await db.query.projets.findMany() : [];
  const projetById = new Map(projetsList.map((p) => [p.id, p]));

  const canReset = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && etatCompte(client) === "actif";
  const peutGerer = peutGererClient(session, client);
  const peutModifier = peutModifierClient(session, client) && etatCompte(client) === "actif";
  const venteEnCours = peutGerer ? await clientAUneVenteEnCours(client.id) : false;
  const initiales = `${client.prenom[0] ?? ""}${client.nom[0] ?? ""}`.toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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

      <Section title="Biens du client" count={mesBiens.length > 0 ? mesBiens.length : undefined}>
        {mesBiens.length === 0 ? (
          <EmptyState icon={<Home />} title="Aucun bien affecté" description="Les biens vendus à ce client apparaîtront ici." className="py-10" />
        ) : (
          <Card className="divide-y divide-navy-50">
            {mesBiens.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small" data-testid="client-bien">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/biens/${b.id}`}
                    className="rounded-xs font-medium text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    {b.designation}
                  </Link>
                  <p className="text-caption text-navy-400">{projetById.get(b.projetId)?.nom}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-navy-400">{formatMoney(b.prix)}</span>
                  <StatusBadge statut={b.statut} label={STATUT_BIEN_LABELS[b.statut]} tone={STATUT_BIEN_TONES[b.statut] ?? "neutral"} />
                  <LinkButton href={`/dashboard/biens/${b.id}`} variant="ghost" size="sm">
                    Ouvrir
                  </LinkButton>
                </div>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}
