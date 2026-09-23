import Link from "next/link";
import { eq } from "drizzle-orm";
import { Users, Pencil } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";
import { PageHeader, Section } from "@/components/ui/Primitives";
import { DataTable } from "@/components/ui/DataTable";
import { EtatCompte } from "@/components/ui/EtatCompte";
import { ActionsCompte } from "@/components/comptes/ActionsCompte";
import { ROLE_LABELS, ROLES_RECRUTABLES_PAR, ROLES_RECRUTEURS, POLE_LABELS } from "@/lib/roles";
import { etatCompte } from "@/lib/comptes";
import { NewRecrueForm } from "./NewRecrueForm";

/** Page Équipe d'un directeur : membres de son pôle et recrutement (voir ROLES_RECRUTABLES_PAR). */
export default async function EquipePage({ searchParams }: { searchParams: Promise<{ supprimes?: string }> }) {
  const session = await requireRole(ROLES_RECRUTEURS);
  const role = session.role as Role;
  const recrutables = ROLES_RECRUTABLES_PAR[role] ?? [];
  const { supprimes } = await searchParams;
  const voirSupprimes = supprimes === "1";

  const rows = await db.query.users.findMany({ where: eq(users.promoteurId, session.promoteurId!) });
  // Uniquement les membres du pôle du directeur connecté
  const pole = rows
    .filter((u) => recrutables.includes(u.role))
    .sort((a, b) => recrutables.indexOf(a.role) - recrutables.indexOf(b.role) || a.nom.localeCompare(b.nom));
  const equipe = pole.filter((u) => (voirSupprimes ? !!u.deletedAt : !u.deletedAt));
  const nbSupprimes = pole.filter((u) => !!u.deletedAt).length;
  const actifs = equipe.filter((u) => u.actif && !u.deletedAt).length;

  return (
    <div>
      <PageHeader
        title="Équipe"
        description={`${POLE_LABELS[role] ?? "Votre pôle"} — ${recrutables.map((r) => ROLE_LABELS[r]).join(", ")}.`}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Section
          title={voirSupprimes ? "Comptes supprimés" : "Membres"}
          count={equipe.length}
          description={
            voirSupprimes
              ? "Historique conservé ; un compte supprimé peut être réactivé à tout moment."
              : equipe.length > 0
                ? `${actifs} actif${actifs > 1 ? "s" : ""} sur ${equipe.length}`
                : undefined
          }
          action={
            voirSupprimes ? (
              <Link href="/dashboard/equipe" className="text-small font-medium text-gold-600 underline-offset-2 hover:underline">
                Retour aux membres actifs
              </Link>
            ) : nbSupprimes > 0 ? (
              <Link href="/dashboard/equipe?supprimes=1" className="text-small text-navy-400 underline-offset-2 hover:underline" data-testid="voir-supprimes">
                Voir les comptes supprimés ({nbSupprimes})
              </Link>
            ) : undefined
          }
          className="lg:col-span-2"
          testId="equipe-membres"
        >
          {/* Ordre des colonnes figé (Nom, Statut, Identifiant, E-mail) : la 2e colonne est lue par les tests. */}
          <DataTable
            testId="table-equipe"
            caption="Membres du pôle"
            minWidth={640}
            columns={[
              { header: "Nom", sortable: true },
              { header: "Statut", sortable: true },
              { header: "Identifiant", hideBelow: "sm" },
              { header: "E-mail", hideBelow: "md" },
              { header: <span className="sr-only">Actions</span>, align: "right", width: "1%" },
            ]}
            rows={equipe.map((u) => ({
              key: u.id,
              testId: "membre-ligne",
              muted: etatCompte(u) !== "actif",
              sort: [`${u.nom} ${u.prenom}`, recrutables.indexOf(u.role), null, null, null],
              cells: [
                <span key="nom" className="inline-flex flex-wrap items-center gap-2 font-medium">
                  {u.prenom} {u.nom}
                  <EtatCompte compte={u} />
                </span>,
                ROLE_LABELS[u.role],
                <span key="id" className="font-mono text-caption">
                  {u.identifiant}
                </span>,
                <span key="mail" className="text-navy-400">
                  {u.email ?? "—"}
                </span>,
                <span key="actions" className="inline-flex items-center justify-end gap-2">
                  {etatCompte(u) === "actif" && (
                    <Link
                      href={`/dashboard/equipe/${u.id}/modifier`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-small font-medium text-navy transition-colors duration-fast hover:bg-navy-50 focus-visible:outline-none focus-visible:shadow-focus"
                      data-testid="modifier-membre"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Modifier
                    </Link>
                  )}
                  <ActionsCompte type="user" id={u.id} nom={`${u.prenom} ${u.nom}`} etat={etatCompte(u)} compact />
                </span>,
              ],
            }))}
            empty={{
              icon: <Users />,
              title: voirSupprimes ? "Aucun compte supprimé" : "Aucun membre pour l'instant",
              description: voirSupprimes ? undefined : "Créez le premier compte de votre pôle avec le formulaire.",
            }}
          />
        </Section>

        <NewRecrueForm roles={recrutables.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
      </div>
    </div>
  );
}
