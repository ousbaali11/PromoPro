import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";
import { Card, PageHeader, EmptyState } from "@/components/ui/Primitives";
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

  return (
    <div>
      <PageHeader
        title="Équipe"
        description={`${POLE_LABELS[role] ?? "Votre pôle"} — ${recrutables.map((r) => ROLE_LABELS[r]).join(", ")}.`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {equipe.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState title="Aucun membre pour l'instant" description="Créez le premier compte de votre pôle avec le formulaire." />
          </div>
        ) : (
          <Card className="overflow-x-auto lg:col-span-2">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                  <th className="px-5 py-3 font-medium">Nom</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Identifiant</th>
                  <th className="px-5 py-3 font-medium">E-mail</th>
                </tr>
              </thead>
              <tbody>
                {equipe.map((u) => (
                  <tr key={u.id} className="border-b border-navy-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-900">
                      {u.prenom} {u.nom}
                      {!u.actif && <span className="ml-2 text-xs text-rose-700">(désactivé)</span>}
                    </td>
                    <td className="px-5 py-3 text-navy-400">{ROLE_LABELS[u.role]}</td>
                    <td className="px-5 py-3 font-mono text-xs text-navy-900">{u.identifiant}</td>
                    <td className="px-5 py-3 text-navy-400">{u.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <NewRecrueForm roles={recrutables.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
      </div>
    </div>
  );
}
