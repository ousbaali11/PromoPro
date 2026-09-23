import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { PageHeader, Breadcrumb } from "@/components/ui/Primitives";
import { ROLES_RECRUTABLES_PAR, ROLES_RECRUTEURS, ROLE_LABELS } from "@/lib/roles";
import { etatCompte } from "@/lib/comptes";
import { ModifierRecrueForm } from "./ModifierRecrueForm";

export default async function ModifierRecruePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole(ROLES_RECRUTEURS);
  const recrutables = ROLES_RECRUTABLES_PAR[session.role as Role] ?? [];
  const recrue = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!recrue || recrue.promoteurId !== session.promoteurId || !recrutables.includes(recrue.role)) notFound();
  if (etatCompte(recrue) !== "actif") redirect("/dashboard/equipe");

  const nomComplet = `${recrue.prenom} ${recrue.nom}`;
  return (
    <div className="mx-auto max-w-lg">
      <Breadcrumb items={[{ label: "Équipe", href: "/dashboard/equipe" }, { label: nomComplet }, { label: "Modifier" }]} />
      <PageHeader eyebrow={ROLE_LABELS[recrue.role]} title={`Modifier ${nomComplet}`} description={`Identifiant ${recrue.identifiant} (inchangé). Les changements sont tracés dans le journal d'activité.`} />
      <ModifierRecrueForm recrue={{ id: recrue.id, nom: recrue.nom, prenom: recrue.prenom, email: recrue.email }} />
    </div>
  );
}
