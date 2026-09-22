import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronLeft, FileImage, FileDown, Paperclip } from "lucide-react";
import { db } from "@/db/client";
import { biens, projets, clients, paiements } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";
import { Card, Badge, EmptyState } from "@/components/ui/Primitives";
import { LinkButton } from "@/components/ui/Button";
import { formatMoney, formatDate, STATUT_BIEN_LABELS, STATUT_BIEN_COLORS } from "@/lib/utils";
import { echeancierDuBien } from "@/lib/paiements";
import { BlockBienForm, UnblockBienButton, PlanUploadForm } from "./BienActions";
import { DesistementForm } from "./DesistementForm";
import { saisirPaiementCommercial } from "./actions";
import { PlanPreview } from "@/components/ui/PlanPreview";
import { PaiementForm } from "@/components/paiements/PaiementForm";

const ECH_LABEL: Record<string, string> = { EN_ATTENTE: "En attente", PARTIELLE: "Partielle", PAYEE: "Payée" };
const ECH_COLOR: Record<string, string> = {
  EN_ATTENTE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PARTIELLE: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PAYEE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export default async function BienDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffSession();

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, id) });
  if (!bien) notFound();
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet || projet.promoteurId !== session.promoteurId) notFound();

  const client = bien.clientId ? await db.query.clients.findFirst({ where: eq(clients.id, bien.clientId) }) : null;
  const vendu = ["VENDU", "LIVRE"].includes(bien.statut);
  const echeancier = vendu ? await echeancierDuBien(bien.id) : [];
  // Paiements du client actuel uniquement (l'historique d'un ancien client désisté reste dans « Biens désistés »)
  const listePaiements =
    vendu && bien.clientId
      ? await db.query.paiements.findMany({
          where: and(eq(paiements.bienId, bien.id), eq(paiements.clientId, bien.clientId)),
          orderBy: [desc(paiements.createdAt)],
        })
      : [];

  const canPropose =
    ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role) && bien.statut === "DISPONIBLE";
  const isCommercialDuBien =
    (session.role === "COMMERCIAL" && bien.commercialId === session.userId) || session.role === "RESPONSABLE_COMMERCIAL";
  const canSaisirPaiement = vendu && isCommercialDuBien;

  const totalPaye = echeancier.reduce((s, e) => s + e.montantPaye, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/dashboard/projets/${projet.id}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-navy-400 hover:text-navy-900"
        >
          <ChevronLeft className="h-4 w-4" /> {projet.nom}
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-navy-900">{bien.designation}</h1>
            <p className="mt-1 text-sm text-navy-400">{bien.nature}</p>
          </div>
          <Badge className={STATUT_BIEN_COLORS[bien.statut]}>{STATUT_BIEN_LABELS[bien.statut]}</Badge>
        </div>
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
              <Link href={`/dashboard/clients/${client.id}`} className="mt-1 block font-medium text-navy-900 hover:underline">
                {client.prenom} {client.nom}
              </Link>
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

          {bien.statut === "VENDU" && isCommercialDuBien && client && (
            <DesistementForm bienId={bien.id} clientNom={`${client.prenom} ${client.nom}`} />
          )}
        </div>
      </div>

      {vendu && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-navy-900">Échéancier de paiement</h2>
            {echeancier.length > 0 && (
              <span className="text-xs text-navy-400">
                {formatMoney(totalPaye)} payés sur {formatMoney(bien.prix)}
              </span>
            )}
          </div>
          {echeancier.length === 0 ? (
            <EmptyState title="Échéancier non disponible" description="Aucune tranche n'a été définie pour cette vente." />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                    <th className="px-5 py-3 font-medium">Tranche</th>
                    <th className="px-5 py-3 font-medium">Montant</th>
                    <th className="px-5 py-3 font-medium">Payé</th>
                    <th className="px-5 py-3 font-medium">Échéance</th>
                    <th className="px-5 py-3 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {echeancier.map((e) => (
                    <tr key={e.id} className="border-b border-navy-50 last:border-0">
                      <td className="px-5 py-3 font-medium text-navy-900">
                        Tranche {e.numero} · {e.pourcentage}%
                      </td>
                      <td className="px-5 py-3 text-navy-900">{formatMoney(e.montant)}</td>
                      <td className="px-5 py-3 text-navy-400">{formatMoney(e.montantPaye)}</td>
                      <td className="px-5 py-3 text-navy-400">{formatDate(e.dateEcheance)}</td>
                      <td className="px-5 py-3">
                        <Badge className={ECH_COLOR[e.statut]}>{ECH_LABEL[e.statut] ?? e.statut}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}

      {vendu && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-navy-900">Paiements</h2>
          {listePaiements.length === 0 ? (
            <EmptyState title="Aucun paiement saisi" />
          ) : (
            <Card className="divide-y divide-navy-50">
              {listePaiements.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-navy-900">
                      {formatMoney(p.montantExact ?? p.montant, p.devise)}
                      {p.trancheNumero && <span className="ml-2 text-xs font-normal text-navy-400">Tranche {p.trancheNumero}</span>}
                    </p>
                    <p className="text-xs text-navy-400">
                      {p.natureOperation} · {p.banque} · {formatDate(p.dateOperation)}
                      {p.reference && ` · réf. ${p.reference}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.preuveUrl && (
                      <a href={p.preuveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold-600 hover:underline">
                        <Paperclip className="h-3.5 w-3.5" /> Preuve
                      </a>
                    )}
                    {p.recuPdfUrl && (
                      <a href={p.recuPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold-600 hover:underline">
                        <FileDown className="h-3.5 w-3.5" /> Reçu
                      </a>
                    )}
                    <Badge
                      className={
                        p.statut === "VALIDE"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-amber-50 text-amber-700 ring-amber-600/20"
                      }
                    >
                      {p.statut === "VALIDE" ? "Validé" : "En attente comptable"}
                    </Badge>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {canSaisirPaiement && (
            <Card className="mt-4 p-5">
              <h3 className="mb-1 text-sm font-medium text-navy-900">Saisir un encaissement</h3>
              <p className="mb-4 text-xs text-navy-400">
                Première tranche (avance) ou tranche suivante réglée auprès de vous. Le Comptable Interne complétera la
                référence et validera l&apos;opération.
              </p>
              <PaiementForm action={saisirPaiementCommercial} bienId={bien.id} echeances={echeancier} />
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
