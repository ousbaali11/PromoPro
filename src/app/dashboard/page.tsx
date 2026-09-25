import { eq, and, count } from "drizzle-orm";
import { KeyRound, HandCoins, FileSignature, Inbox, Users, Pin } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets, propositions, prospects, users, epingles as epinglesTable } from "@/db/schema";
import { PageHeader, Section, Stat } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/roles";
import { chargerPromoteur } from "@/lib/promoteurs";
import { STATUT_BIEN_LABELS } from "@/lib/utils";
import { RendezVousSection } from "@/app/dashboard/rendez-vous/RendezVousSection";
import { Suspense } from "react";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { decoderPlage } from "@/lib/plage-dates";
import { SectionGraphiques } from "./SectionGraphiques";
import { GraphiquesSkeleton } from "@/components/graphiques/Graphiques";
import { ErreurGraphiques } from "@/components/graphiques/ErreurGraphiques";

async function countBiensByStatut(promoteurId: string, statut: string) {
  const rows = await db
    .select({ n: count() })
    .from(biens)
    .innerJoin(projets, eq(biens.projetId, projets.id))
    .where(and(eq(projets.promoteurId, promoteurId), eq(biens.statut, statut)));
  return rows[0]?.n ?? 0;
}

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ plage?: string; graphiques?: string }> }) {
  const session = await requireStaffSession();
  const promoteurId = session.promoteurId!;
  // Plage de dates partagée par les graphiques du tableau de bord (URL ?plage=, dernier choix rappelé côté navigateur)
  const { plage: codePlage, graphiques: modeGraphiques } = await searchParams;
  const plage = decoderPlage(codePlage);
  // Panne simulée de la section graphiques (tests de la frontière d'erreur) : ignorée en production
  const panne = process.env.NODE_ENV !== "production" && modeGraphiques === "panne";
  const promoteur = await chargerPromoteur(promoteurId);

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
      .innerJoin(users, eq(propositions.commercialId, users.id))
      .where(and(eq(propositions.statut, "ENVOYEE"), eq(users.promoteurId, promoteurId)));
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

  // Biens épinglés par l'utilisateur (accès rapide)
  const epingles = (
    await db
      .select({ id: epinglesTable.id, bienId: biens.id, designation: biens.designation, statut: biens.statut })
      .from(epinglesTable)
      .innerJoin(biens, eq(epinglesTable.bienId, biens.id))
      .where(eq(epinglesTable.userId, session.userId))
  ).slice(0, 12);

  return (
    <div>
      <PageHeader
        title={`Bonjour ${session.prenom}`}
        description={`Espace ${ROLE_LABELS[session.role as never]} — vue d'ensemble de ${promoteur.nom} · ${plage.libelle}.`}
        action={
          <Suspense fallback={null}>
            <DateRangePicker code={codePlage} userId={session.userId} />
          </Suspense>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Biens disponibles" value={disponibles} icon={<KeyRound />} tone={disponibles > 0 ? "success" : undefined} />
        <Stat label="Biens vendus" value={vendus} icon={<HandCoins />} />
        <Stat label="Propositions en cours" value={enProposition} icon={<FileSignature />} tone={enProposition > 0 ? "info" : undefined} />
        {session.role === "PDG" && (
          <Stat label="Propositions à valider" value={propositionsEnAttente} icon={<Inbox />} accent={propositionsEnAttente > 0} hint="Décision attendue" />
        )}
        {["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "ASSISTANT_ADMINISTRATIF"].includes(session.role) && (
          <Stat label="Prospects non traités" value={prospectsNonTraites} icon={<Users />} accent={prospectsNonTraites > 0} hint="À contacter" />
        )}
      </div>

      {/* Totaux et graphiques de la plage choisie : diffusés sous Suspense, squelette pendant le calcul (clé = plage) */}
      <ErreurGraphiques>
        <Suspense key={plage.code} fallback={<GraphiquesSkeleton />}>
          <SectionGraphiques session={session} plage={plage} panne={panne} />
        </Suspense>
      </ErreurGraphiques>

      {epingles.length > 0 && (
        <Section
          title="Biens épinglés"
          count={epingles.length}
          description="Vos accès rapides, choisis depuis la liste des biens d’un projet."
          className="mt-8"
          testId="section-epingles"
        >
          <ul className="flex flex-wrap gap-2">
            {epingles.map((e) => (
              <li key={e.id}>
                <LinkButton href={`/dashboard/biens/${e.bienId}`} variant="secondary" size="sm">
                  <Pin className="text-gold" />
                  {e.designation}
                  <span className="text-navy-400">· {STATUT_BIEN_LABELS[e.statut]}</span>
                </LinkButton>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && (
        <Section title="Rendez-vous de mes clients" className="mt-8" testId="section-rdv-commercial">
          <RendezVousSection service="COMMERCIAL" session={session} canAct />
        </Section>
      )}

      <Section title="Accès rapide" className="mt-8" testId="section-acces-rapide">
        <div className="flex flex-wrap gap-2">
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
      </Section>
    </div>
  );
}
