import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { clients, users, biens } from "@/db/schema";
import { Card, Badge, PageHeader } from "@/components/ui/Primitives";
import { formatDate, formatMoney, STATUT_BIEN_COLORS, STATUT_BIEN_LABELS } from "@/lib/utils";
import { ResetPasswordButton } from "../ResetPasswordButton";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-navy-400">{label}</p>
      <p className="mt-0.5 text-sm text-navy-900">{value || "—"}</p>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffSession();

  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client || client.promoteurId !== session.promoteurId) notFound();

  // Un commercial ne voit que ses propres clients
  if (["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && client.commercialId !== session.userId) {
    notFound();
  }

  const commercial = client.commercialId
    ? await db.query.users.findFirst({ where: eq(users.id, client.commercialId) })
    : null;
  const mesBiens = await db.query.biens.findMany({ where: eq(biens.clientId, client.id) });
  const projetIds = [...new Set(mesBiens.map((b) => b.projetId))];
  const projetsList = projetIds.length ? await db.query.projets.findMany() : [];
  const projetById = new Map(projetsList.map((p) => [p.id, p]));

  const canReset = ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/clients"
        className="mb-4 inline-flex items-center gap-1 text-sm text-navy-400 hover:text-navy-900"
      >
        <ChevronLeft className="h-4 w-4" /> Clients
      </Link>

      <PageHeader
        title={`${client.prenom} ${client.nom}`}
        description={`Identifiant ${client.identifiant} · créé le ${formatDate(client.createdAt)}`}
        action={canReset ? <ResetPasswordButton clientId={client.id} /> : undefined}
      />

      <div className="space-y-4">
        <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Info label="Date de naissance" value={client.dateNaissance} />
          <Info label="Lieu de naissance" value={client.lieuNaissance} />
          <Info label="Adresse" value={client.adresse} />
          <Info label="Pièce d'identité" value={`${client.pieceType ?? "CIN"} ${client.pieceNumero ?? ""}`.trim()} />
          <Info label="Téléphone 1" value={client.telephone1} />
          <Info label="Téléphone 2" value={client.telephone2} />
          <Info label="E-mail" value={client.email} />
          <Info label="Commercial" value={commercial ? `${commercial.prenom} ${commercial.nom}` : null} />
        </Card>

        <Card className="p-5">
          <p className="text-xs text-navy-400">Scan de la pièce d&apos;identité</p>
          {client.pieceDocUrl ? (
            <a
              href={client.pieceDocUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-navy-50 px-3 py-2 text-sm text-navy hover:bg-navy-100"
            >
              <FileText className="h-4 w-4" /> Ouvrir le document
            </a>
          ) : (
            <p className="mt-1 text-sm text-navy-400">Aucun document importé.</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-xs text-navy-400">Biens du client</p>
          {mesBiens.length === 0 ? (
            <p className="text-sm text-navy-400">Aucun bien affecté pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-navy-50">
              {mesBiens.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/dashboard/biens/${b.id}`} className="font-medium text-navy-900 hover:underline">
                    {b.designation}
                    <span className="ml-2 text-xs font-normal text-navy-400">{projetById.get(b.projetId)?.nom}</span>
                  </Link>
                  <span className="flex items-center gap-3">
                    <span className="text-navy-400">{formatMoney(b.prix)}</span>
                    <Badge className={STATUT_BIEN_COLORS[b.statut]}>{STATUT_BIEN_LABELS[b.statut]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
