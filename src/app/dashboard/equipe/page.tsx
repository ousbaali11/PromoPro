import { eq } from "drizzle-orm";
import { Users } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";
import { Badge, PageHeader, Section } from "@/components/ui/Primitives";
import { DataTable } from "@/components/ui/DataTable";
import { ROLE_LABELS, ROLES_RECRUTABLES_PAR, ROLES_RECRUTEURS, POLE_LABELS } from "@/lib/roles";
import { NewRecrueForm } from "./NewRecrueForm";

/** Page Équipe d'un directeur : membres de son pôle et recrutement (voir ROLES_RECRUTABLES_PAR). */
export default async function EquipePage() {
  const session = await requireRole(ROLES_RECRUTEURS);
  const role = session.role as Role;
  const recrutables = ROLES_RECRUTABLES_PAR[role] ?? [];

  const rows = await db.query.users.findMany({ where: eq(users.promoteurId, session.promoteurId!) });
  // Uniquement les membres du pôle du directeur connecté
  const equipe = rows
    .filter((u) => recrutables.includes(u.role))
    .sort((a, b) => recrutables.indexOf(a.role) - recrutables.indexOf(b.role) || a.nom.localeCompare(b.nom));
  const actifs = equipe.filter((u) => u.actif).length;

  return (
    <div>
      <PageHeader
        title="Équipe"
        description={`${POLE_LABELS[role] ?? "Votre pôle"} — ${recrutables.map((r) => ROLE_LABELS[r]).join(", ")}.`}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Section
          title="Membres"
          count={equipe.length}
          description={equipe.length > 0 ? `${actifs} actif${actifs > 1 ? "s" : ""} sur ${equipe.length}` : undefined}
          className="lg:col-span-2"
          testId="equipe-membres"
        >
          {/* Ordre des colonnes figé (Nom, Statut, Identifiant, E-mail) : la 2e colonne est lue par les tests. */}
          <DataTable
            testId="table-equipe"
            caption="Membres du pôle"
            minWidth={480}
            columns={[
              { header: "Nom", sortable: true },
              { header: "Statut", sortable: true },
              { header: "Identifiant", hideBelow: "sm" },
              { header: "E-mail", hideBelow: "md" },
            ]}
            rows={equipe.map((u) => ({
              key: u.id,
              testId: "membre-ligne",
              muted: !u.actif,
              sort: [`${u.nom} ${u.prenom}`, recrutables.indexOf(u.role), null, null],
              cells: [
                <span key="nom" className="inline-flex items-center gap-2 font-medium">
                  {u.prenom} {u.nom}
                  {!u.actif && (
                    <Badge tone="danger" className="font-normal">
                      désactivé
                    </Badge>
                  )}
                </span>,
                ROLE_LABELS[u.role],
                <span key="id" className="font-mono text-caption">
                  {u.identifiant}
                </span>,
                <span key="mail" className="text-navy-400">
                  {u.email ?? "—"}
                </span>,
              ],
            }))}
            empty={{
              icon: <Users />,
              title: "Aucun membre pour l'instant",
              description: "Créez le premier compte de votre pôle avec le formulaire.",
            }}
          />
        </Section>

        <NewRecrueForm roles={recrutables.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
      </div>
    </div>
  );
}
