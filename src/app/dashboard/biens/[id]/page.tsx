import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronLeft, FileImage } from "lucide-react";
import { db } from "@/db/client";
import { biens, projets, clients } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";
import { Card, Badge } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { formatMoney, STATUT_BIEN_LABELS, STATUT_BIEN_COLORS } from "@/lib/utils";
import { BlockBienForm, UnblockBienButton, PlanUploadForm } from "./BienActions";
import { PlanPreview } from "@/components/ui/PlanPreview";

export default async function BienDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffSession();

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, id) });
  if (!bien) notFound();
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet || projet.promoteurId !== session.promoteurId) notFound();

  const client = bien.clientId ? await db.query.clients.findFirst({ where: eq(clients.id, bien.clientId) }) : null;

  const canPropose =
    ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && bien.statut === "DISPONIBLE";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/dashboard/projets/${projet.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-navy-400 hover:text-navy-900"
      >
        <ChevronLeft className="h-4 w-4" /> {projet.nom}
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">{bien.designation}</h1>
          <p className="mt-1 text-sm text-navy-400">{bien.nature}</p>
        </div>
        <Badge className={STATUT_BIEN_COLORS[bien.statut]}>{STATUT_BIEN_LABELS[bien.statut]}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-5">
        <div className="space-y-4 sm:col-span-2">
          <Card className="flex aspect-square items-center justify-center overflow-hidden sm:aspect-auto sm:min-h-64">
            {bien.planUrl ? (
              <PlanPreview url={bien.planUrl} />
            ) : (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-navy-400">
                <FileImage className="h-8 w-8" />
                <p className="text-xs">Aucun plan importé.</p>
              </div>
            )}
          </Card>
          {session.role === "DIRECTEUR_COMMERCIAL" && (
            <Card className="p-4">
              <PlanUploadForm bienId={bien.id} hasPlan={!!bien.planUrl} />
            </Card>
          )}
        </div>

        <div className="space-y-4 sm:col-span-3">
          <Card className="grid grid-cols-2 gap-4 p-5">
            <div>
              <p className="text-xs text-navy-400">Prix</p>
              <p className="mt-1 text-lg font-semibold text-navy-900">{formatMoney(bien.prix)}</p>
            </div>
            <div>
              <p className="text-xs text-navy-400">Surface</p>
              <p className="mt-1 text-lg font-semibold text-navy-900">{bien.surface} m²</p>
            </div>
          </Card>

          {client && (
            <Card className="p-5">
              <p className="text-xs text-navy-400">Client</p>
              <p className="mt-1 font-medium text-navy-900">
                {client.prenom} {client.nom}
              </p>
              <p className="text-xs text-navy-400">{client.telephone1}</p>
            </Card>
          )}

          {bien.statut === "PROPOSITION_EN_COURS" && (
            <Card className="border-l-4 border-sky-400 p-5">
              <p className="text-sm text-navy-900">Une proposition est en cours d&apos;examen par le PDG.</p>
              <Link href="/dashboard/propositions" className="mt-1 inline-block text-sm text-gold-600 hover:underline">
                Voir les propositions →
              </Link>
            </Card>
          )}

          {bien.statut === "BLOQUE_PDG" && session.role === "PDG" && (
            <Card className="p-5">
              <p className="text-xs text-navy-400">Votre commentaire privé</p>
              <p className="mt-1 text-sm text-navy-900">{bien.pdgCommentaire || "—"}</p>
              <div className="mt-3">
                <UnblockBienButton bienId={bien.id} />
              </div>
            </Card>
          )}

          {bien.statut === "BLOQUE_PDG" && session.role !== "PDG" && (
            <Card className="border-l-4 border-amber-400 p-5">
              <p className="text-sm text-navy-900">Ce bien a été bloqué par le PDG et n&apos;est pas modifiable.</p>
            </Card>
          )}

          {session.role === "PDG" && bien.statut === "DISPONIBLE" && <BlockBienForm bienId={bien.id} />}

          {canPropose && (
            <LinkButton href={`/dashboard/propositions/nouvelle?bienId=${bien.id}`} variant="gold">
              Envoyer une proposition
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}
