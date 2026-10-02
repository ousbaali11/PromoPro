import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { biens, clients, projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { peutGererClient } from "@/lib/comptes";
import { PageHeader, Breadcrumb } from "@/components/ui/Primitives";
import { formatMoney } from "@/lib/utils";
import { datesEcheancierParDefaut } from "@/lib/echeancier";
import { NewPropositionForm } from "./NewPropositionForm";

export default async function NouvellePropositionPage({
  searchParams,
}: {
  searchParams: Promise<{ bienId?: string }>;
}) {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);
  const { bienId } = await searchParams;
  if (!bienId) redirect("/dashboard/projets");

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien || bien.statut !== "DISPONIBLE") notFound();
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });

  // Seuls les clients actifs (ni suspendus, ni supprimés) peuvent recevoir une nouvelle proposition, et seulement ceux
  // que le commercial connecté gère (tout le pôle pour le Responsable Commercial) : pas d'annuaire des clients des collègues
  const listeClients = (await db.query.clients.findMany({ where: and(eq(clients.promoteurId, session.promoteurId!), isNull(clients.deletedAt)) })).filter(
    (c) => c.actif && peutGererClient(session, c),
  );

  const defaultDates = datesEcheancierParDefaut();

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb
        items={[
          { label: "Projets", href: "/dashboard/projets" },
          ...(projet ? [{ label: projet.nom, href: `/dashboard/projets/${projet.id}` }] : []),
          { label: bien.designation, href: `/dashboard/biens/${bien.id}` },
          { label: "Nouvelle proposition" },
        ]}
      />
      <PageHeader
        eyebrow={projet?.nom}
        title="Envoyer une proposition"
        description={`${bien.designation} · ${formatMoney(bien.prix)} — à destination du PDG.`}
      />
      <NewPropositionForm bienId={bien.id} prix={bien.prix} clients={listeClients} defaultDates={defaultDates} />
    </div>
  );
}
