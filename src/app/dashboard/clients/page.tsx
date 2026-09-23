import Link from "next/link";
import { eq } from "drizzle-orm";
import { Plus, FileText, Users } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/ui/Primitives";
import { DataTable } from "@/components/ui/DataTable";
import { EtatCompte } from "@/components/ui/EtatCompte";
import { LinkButton } from "@/components/ui/Button";
import { etatCompte } from "@/lib/comptes";
import { ResetPasswordButton } from "./ResetPasswordButton";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ supprimes?: string }> }) {
  const session = await requireStaffSession();
  const { supprimes } = await searchParams;
  const voirSupprimes = supprimes === "1";

  const all = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });
  const visibles = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role)
    ? all.filter((c) => c.commercialId === session.userId)
    : all;
  // Les comptes supprimés (suppression douce) sortent des listes actives ; ils restent consultables et restaurables
  const rows = visibles.filter((c) => (voirSupprimes ? !!c.deletedAt : !c.deletedAt));
  const nbSupprimes = visibles.filter((c) => !!c.deletedAt).length;

  const canCreate = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "DIRECTEUR_COMMERCIAL"].includes(session.role);
  const canReset = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role);

  const nouveau = canCreate ? (
    <LinkButton href="/dashboard/clients/nouveau" size="sm">
      <Plus className="h-4 w-4" /> Nouveau client
    </LinkButton>
  ) : undefined;

  return (
    <div>
      <PageHeader
        title={voirSupprimes ? "Clients — comptes supprimés" : "Clients"}
        description={
          voirSupprimes
            ? "Historique conservé ; un compte supprimé peut être réactivé depuis sa fiche."
            : `${rows.length} compte${rows.length > 1 ? "s" : ""} client${rows.length > 1 ? "s" : ""} pour l'accès à leur espace personnel.`
        }
        action={
          <>
            {voirSupprimes ? (
              <Link href="/dashboard/clients" className="text-small font-medium text-gold-600 underline-offset-2 hover:underline">
                Retour aux clients actifs
              </Link>
            ) : nbSupprimes > 0 ? (
              <Link href="/dashboard/clients?supprimes=1" className="text-small text-navy-400 underline-offset-2 hover:underline" data-testid="voir-supprimes">
                Voir les comptes supprimés ({nbSupprimes})
              </Link>
            ) : null}
            {!voirSupprimes && nouveau}
          </>
        }
      />

      <DataTable
        testId="table-clients"
        caption="Liste des clients"
        defaultSort={{ column: 0, sens: "asc" }}
        columns={[
          { header: "Nom", sortable: true },
          { header: "Pièce", hideBelow: "md", width: "1%" },
          { header: "Téléphone", hideBelow: "sm" },
          { header: "E-mail", hideBelow: "lg" },
          { header: "Identifiant", sortable: true },
          ...(canReset ? [{ header: <span className="sr-only">Actions</span>, align: "right" as const, width: "1%" }] : []),
        ]}
        rows={rows.map((c) => ({
          key: c.id,
          testId: "client-ligne",
          muted: etatCompte(c) !== "actif",
          sort: [`${c.nom} ${c.prenom}`, null, null, null, c.identifiant],
          cells: [
            <span key="nom" className="inline-flex flex-wrap items-center gap-2">
              <Link
                href={`/dashboard/clients/${c.id}`}
                className="rounded-xs font-medium text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                {c.prenom} {c.nom}
              </Link>
              <EtatCompte compte={c} />
            </span>,
            c.pieceDocUrl ? (
              <a
                key="piece"
                href={c.pieceDocUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                <FileText className="h-3.5 w-3.5" /> Voir
              </a>
            ) : (
              <span key="piece" className="text-caption text-navy-300">
                —
              </span>
            ),
            <span key="tel" className="tabular text-navy-400">
              {c.telephone1}
            </span>,
            <span key="mail" className="text-navy-400">
              {c.email}
            </span>,
            <span key="id" className="font-mono text-caption text-navy-900">
              {c.identifiant}
            </span>,
            ...(canReset ? [etatCompte(c) === "actif" ? <ResetPasswordButton key="reset" clientId={c.id} /> : <span key="reset" />] : []),
          ],
        }))}
        empty={{
          icon: <Users />,
          title: voirSupprimes ? "Aucun compte supprimé" : "Aucun client",
          description: voirSupprimes
            ? undefined
            : canCreate
              ? "Créez le premier dossier client : il recevra ses identifiants d'accès."
              : "Les clients créés apparaîtront ici.",
          action: voirSupprimes ? undefined : nouveau,
        }}
      />
    </div>
  );
}
