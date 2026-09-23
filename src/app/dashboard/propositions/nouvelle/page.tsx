import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db/client";
import { biens, clients, projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/ui/Primitives";
import { formatMoney, addMonths } from "@/lib/utils";
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

  const listeClients = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });

  const today = new Date();
  const defaultDates = [today, addMonths(today, 6), addMonths(today, 12), addMonths(today, 18)].map(
    (d) => d.toISOString().slice(0, 10),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/dashboard/biens/${bien.id}`}
        className="mb-3 inline-flex items-center gap-1 rounded-xs text-small text-navy-400 transition-colors duration-fast hover:text-navy-900 focus-visible:outline-none focus-visible:shadow-focus"
      >
        <ChevronLeft className="h-4 w-4" /> {bien.designation}
      </Link>
      <PageHeader
        eyebrow={projet?.nom}
        title="Envoyer une proposition"
        description={`${bien.designation} · ${formatMoney(bien.prix)} — à destination du PDG.`}
      />
      <NewPropositionForm bienId={bien.id} prix={bien.prix} clients={listeClients} defaultDates={defaultDates} />
    </div>
  );
}
