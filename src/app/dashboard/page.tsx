import { eq, and, count } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets, propositions, prospects } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/roles";
import { RendezVousSection } from "@/app/dashboard/rendez-vous/RendezVousSection";

async function countBiensByStatut(promoteurId: string, statut: string) {
  const rows = await db
    .select({ n: count() })
    .from(biens)
    .innerJoin(projets, eq(biens.projetId, projets.id))
    .where(and(eq(projets.promoteurId, promoteurId), eq(biens.statut, statut)));
  return rows[0]?.n ?? 0;
}

export default async function DashboardHome() {
  const session = await requireStaffSession();
  const promoteurId = session.promoteurId!;

  const [disponibles, vendus, enProposition] = await Promise.all([
    countBiensByStatut(promoteurId, "DISPONIBLE"),
    countBiensByStatut(promoteurId, "VENDU"),
    countBiensByStatut(promoteurId, "PROPOSITION_EN_COURS"),
  ]);

  let propositionsEnAttente = 0;
  if (["PDG"].includes(session.role)) {
    const rows = await db
      .select({ n: count() })
      .from(propositions)
      .where(eq(propositions.statut, "ENVOYEE"));
    propositionsEnAttente = rows[0]?.n ?? 0;
  }

  let prospectsNonTraites = 0;
  if (["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "ASSISTANT_ADMINISTRATIF"].includes(session.role)) {
    const rows = await db
      .select({ n: count() })
      .from(prospects)
      .where(
        and(
          eq(prospects.promoteurId, promoteurId),
          eq(prospects.statutContact, "NON_CONTACTE"),
          session.role === "ASSISTANT_ADMINISTRATIF" ? undefined : eq(prospects.commercialId, session.userId),
        ),
      );
    prospectsNonTraites = rows[0]?.n ?? 0;
  }

  return (
    <div>
      <PageHeader
        title={`Bonjour ${session.prenom}`}
        description={`Espace ${ROLE_LABELS[session.role as never]} — vue d'ensemble de PromoPro.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Biens disponibles" value={disponibles} />
        <Stat label="Biens vendus" value={vendus} />
        <Stat label="Propositions en cours" value={enProposition} />
        {session.role === "PDG" && <Stat label="Propositions à valider" value={propositionsEnAttente} accent />}
        {["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "ASSISTANT_ADMINISTRATIF"].includes(session.role) && (
          <Stat label="Prospects non traités" value={prospectsNonTraites} accent />
        )}
      </div>

      {["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-navy-900">Rendez-vous de mes clients</h2>
          <RendezVousSection service="COMMERCIAL" session={session} canAct />
        </section>
      )}

      <Card className="mt-6 p-6">
        <h2 className="text-sm font-medium text-navy-900">Accès rapide</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton href="/dashboard/projets" variant="secondary" size="sm">
            Projets &amp; biens
          </LinkButton>
          {["PDG", "DIRECTEUR_COMMERCIAL", "COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && (
            <LinkButton href="/dashboard/propositions" variant="secondary" size="sm">
              Propositions
            </LinkButton>
          )}
          {["DIRECTEUR_COMMERCIAL", "COMMERCIAL", "RESPONSABLE_COMMERCIAL", "PDG"].includes(session.role) && (
            <LinkButton href="/dashboard/clients" variant="secondary" size="sm">
              Clients
            </LinkButton>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-navy-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-gold-600" : "text-navy-900"}`}>{value}</p>
    </Card>
  );
}
