import { desc, eq } from "drizzle-orm";
import { UserRoundX, Inbox } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { desistements, projets, clients, users } from "@/db/schema";
import { EmptyState, PageHeader, Section } from "@/components/ui/Primitives";
import { DesistementCarte } from "@/components/dossier/cartes";
import { lienFicheClient } from "@/lib/dossier-client";

/**
 * Index des désistements du promoteur : ce qui reste à traiter et l'historique.
 * Aucune action ici : la vérification des papiers et le remboursement se font
 * sur la fiche du client (onglet Contrat), un dossier à la fois.
 */
export default async function DesistementsPage() {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF", "DIRECTEUR_FINANCIER", "PDG"]);

  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetIds = new Set(allProjets.map((p) => p.id));
  const bienById = new Map((await db.query.biens.findMany()).filter((b) => projetIds.has(b.projetId)).map((b) => [b.id, b]));
  const clientById = new Map(
    (await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) })).map((c) => [c.id, c]),
  );
  const userById = new Map((await db.query.users.findMany({ where: eq(users.promoteurId, session.promoteurId!) })).map((u) => [u.id, u]));

  const rows = (await db.query.desistements.findMany({ orderBy: [desc(desistements.createdAt)] })).filter((d) =>
    bienById.has(d.bienId),
  );
  const enCours = rows.filter((d) => d.statut !== "REMBOURSE");
  const clos = rows.filter((d) => d.statut === "REMBOURSE");

  const carte = (d: (typeof rows)[number]) => (
    <DesistementCarte
      key={d.id}
      desistement={d}
      bien={bienById.get(d.bienId)}
      client={clientById.get(d.clientId)}
      commercial={d.commercialId ? userById.get(d.commercialId) : null}
      lienFiche={clientById.has(d.clientId) ? lienFicheClient(d.clientId, d.bienId, "contrat") : undefined}
    />
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Désistements"
        description="Vérification des papiers du client puis organisation du remboursement avec le Directeur Financier — à traiter depuis la fiche du client."
      />

      <Section title="À traiter" count={enCours.length} countTone={enCours.length > 0 ? "warning" : "neutral"} testId="desistements-a-traiter">
        {enCours.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Aucun désistement en attente" description="Quand un commercial enregistre un désistement, il apparaîtra ici." />
        ) : (
          <div className="space-y-4">{enCours.map(carte)}</div>
        )}
      </Section>

      {clos.length > 0 && (
        <Section title="Historique" count={clos.length} testId="desistements-historique">
          <div className="space-y-4">{clos.map(carte)}</div>
        </Section>
      )}

      {rows.length === 0 && (
        <p className="sr-only">
          <UserRoundX className="inline h-4 w-4" /> Aucun désistement enregistré.
        </p>
      )}
    </div>
  );
}
