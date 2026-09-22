import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { desistements, biens, projets } from "@/db/schema";
import { EmptyState } from "@/components/ui/Primitives";
import { TodoModule } from "@/components/layout/TodoModule";

export default async function DesistementsPage() {
  const session = await requireStaffSession();
  const allBiens = await db.query.biens.findMany();
  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetIds = new Set(allProjets.map((p) => p.id));
  const bienIds = new Set(allBiens.filter((b) => projetIds.has(b.projetId)).map((b) => b.id));
  const all = await db.query.desistements.findMany();
  const rows = all.filter((d) => bienIds.has(d.bienId));

  return (
    <TodoModule
      title="Désistements"
      description="Désistements clients en attente de vérification et de remboursement."
      specSection="section 7.1 — Responsable Administratif"
    >
      {rows.length === 0 && (
        <EmptyState
          title="Aucun désistement"
          description="Quand un commercial enregistre un désistement, il apparaîtra ici."
        />
      )}
    </TodoModule>
  );
}
