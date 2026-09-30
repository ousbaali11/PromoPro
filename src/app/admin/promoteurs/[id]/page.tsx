import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { Building2, Mail, Phone } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { promoteurs, users } from "@/db/schema";
import { Breadcrumb, Card, Callout, Info, PageHeader, Section } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { EtatCompte } from "@/components/ui/EtatCompte";
import { ActionsCompte } from "@/components/comptes/ActionsCompte";
import { ROLE_LABELS } from "@/lib/roles";
import { etatCompte } from "@/lib/comptes";
import { formatDate } from "@/lib/utils";
import { jourIso } from "@/lib/abonnement";
import { avertissementDernierTitulaire, ROLES_DIRECTION, rolesSansTitulaire, trierDirections } from "@/lib/directions";
import { PromoteurActions } from "../../PromoteurActions";
import { LogoPromoteurForm } from "../../LogoPromoteurForm";
import { LABELS_STATUT_PROMOTEUR, TONES_STATUT_PROMOTEUR } from "../../statut-promoteur";
import { AjoutDirectionForm } from "./AjoutDirectionForm";

/*
 * Fiche d'un promoteur (Super Admin) : abonnement (activer / suspendre), logo,
 * directions de CE promoteur (suspendre, supprimer, réactiver — logique
 * partagée avec le reste du projet : ConfirmButton, toast Annuler, journal)
 * et ajout d'une direction à tout moment. Plusieurs titulaires d'un même rôle,
 * ou aucun, sont possibles : le Super Admin est seulement prévenu quand une
 * action laisserait le promoteur sans titulaire d'un rôle.
 */
export default async function FichePromoteurPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["SUPER_ADMIN"]);
  const { id } = await params;
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, id) });
  if (!promoteur) notFound();

  const directions = trierDirections(
    await db.query.users.findMany({ where: and(eq(users.promoteurId, promoteur.id), inArray(users.role, ROLES_DIRECTION)) }),
  );
  const sansTitulaire = rolesSansTitulaire(directions);
  const enExercice = directions.filter((u) => u.actif && !u.deletedAt).length;

  return (
    <div>
      <Breadcrumb items={[{ label: "Promoteurs", href: "/admin" }, { label: promoteur.nom }]} />
      <PageHeader
        eyebrow="Promoteur"
        title={promoteur.nom}
        description="Abonnement, logo et directions de ce promoteur."
        action={<PromoteurActions promoteurId={promoteur.id} statut={promoteur.statut} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5" data-testid="carte-abonnement">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-h3 text-navy-900">Abonnement</h2>
            <StatusBadge statut={promoteur.statut} label={LABELS_STATUT_PROMOTEUR[promoteur.statut]} tone={TONES_STATUT_PROMOTEUR[promoteur.statut]} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Info label="Formule" value={promoteur.abonnementFormule ?? "—"} />
            <Info
              label="Échéance"
              value={
                <span className="tabular" data-testid="abonnement-echeance" data-echeance={jourIso(promoteur.abonnementFin)}>
                  {formatDate(promoteur.abonnementFin)}
                </span>
              }
            />
            <Info label="Début" value={<span className="tabular">{formatDate(promoteur.abonnementDebut)}</span>} />
            <Info label="Créé le" value={<span className="tabular">{formatDate(promoteur.createdAt)}</span>} />
          </dl>
          <p className="mt-4 text-caption text-navy-400">
            Le paiement se fait par virement, hors plateforme. L&apos;activation ouvre l&apos;accès à tous les comptes du promoteur ; la
            suspension le coupe immédiatement. Un abonnement actif peut être prolongé à tout moment, sans attendre son échéance : la
            durée s&apos;ajoute à l&apos;échéance en cours.
          </p>
        </Card>

        <Card className="p-5" data-testid="carte-identite">
          <h2 className="text-h3 text-navy-900">Identité</h2>
          <div className="mt-4 flex items-center gap-4">
            {promoteur.logoUrl ? (
              // Fichier servi par /api/files avec la session : pas d'optimiseur d'image Next
              // eslint-disable-next-line @next/next/no-img-element
              <img src={promoteur.logoUrl} alt={`Logo ${promoteur.nom}`} className="h-16 w-16 rounded-md bg-white object-contain ring-1 ring-navy-100" data-testid="logo-promoteur-grand" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-md bg-navy-50 text-navy-300" aria-hidden>
                <Building2 className="h-6 w-6" />
              </span>
            )}
            <div className="min-w-0 space-y-1 text-small text-navy-500">
              <p className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{promoteur.contactEmail ?? "—"}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span>{promoteur.contactTelephone ?? "—"}</span>
              </p>
            </div>
          </div>
          <div className="mt-4">
            <LogoPromoteurForm promoteurId={promoteur.id} nom={promoteur.nom} logoUrl={promoteur.logoUrl} />
          </div>
        </Card>

        <AjoutDirectionForm promoteurId={promoteur.id} />
      </div>

      <Section
        title="Directions"
        count={directions.length}
        description={`${enExercice} en exercice · PDG, Directeur Commercial, Directeur Financier. Un rôle peut avoir plusieurs titulaires, ou aucun.`}
        className="mt-8"
        testId="section-directions"
      >
        {sansTitulaire.length > 0 && (
          <Callout tone="warning" className="mb-4" testId="roles-sans-titulaire">
            Aucun titulaire en exercice pour : {sansTitulaire.map((r) => ROLE_LABELS[r]).join(", ")}.
          </Callout>
        )}
        <DataTable
          testId="table-directions"
          caption={`Directions de ${promoteur.nom}`}
          columns={[
            { header: "Nom", sortable: true },
            { header: "Rôle", sortable: true },
            { header: "Identifiant", hideBelow: "md" },
            { header: "E-mail", hideBelow: "lg" },
            { header: <span className="sr-only">Actions</span>, align: "right", width: "1%" },
          ]}
          rows={directions.map((u) => ({
            key: u.id,
            testId: "direction-ligne",
            muted: etatCompte(u) !== "actif",
            sort: [`${u.nom} ${u.prenom}`, ROLE_LABELS[u.role], null, null, null],
            cells: [
              <span key="nom" className="inline-flex flex-wrap items-center gap-2 font-medium">
                {u.prenom} {u.nom}
                <EtatCompte compte={u} />
              </span>,
              ROLE_LABELS[u.role],
              <span key="id" className="font-mono text-caption">
                {u.identifiant}
              </span>,
              <span key="email" className="text-navy-400">
                {u.email ?? "—"}
              </span>,
              <ActionsCompte
                key="actions"
                type="user"
                id={u.id}
                nom={`${u.prenom} ${u.nom}`}
                etat={etatCompte(u)}
                avertissement={avertissementDernierTitulaire(directions, u)}
                compact
              />,
            ],
          }))}
          empty={{ title: "Aucune direction", description: "Ajoutez une direction avec le formulaire ci-dessus." }}
        />
      </Section>
    </div>
  );
}
