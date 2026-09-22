import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileDown, Paperclip } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { paiements, biens, projets, clients, users, propositions, syndics } from "@/db/schema";
import { Card, Badge, EmptyState, PageHeader } from "@/components/ui/Primitives";
import { formatMoney, formatDate } from "@/lib/utils";
import { CompleterForm } from "./CompleterForm";
import { ValiderSyndicButton } from "./ValiderSyndicButton";

export default async function PaiementsPage() {
  const session = await requireRole(["COMPTABLE_INTERNE", "DIRECTEUR_FINANCIER", "PDG"]);
  const isComptable = session.role === "COMPTABLE_INTERNE";

  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetIds = new Set(allProjets.map((p) => p.id));
  const allBiens = (await db.query.biens.findMany()).filter((b) => projetIds.has(b.projetId));
  const bienById = new Map(allBiens.map((b) => [b.id, b]));
  const allClients = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });
  const clientById = new Map(allClients.map((c) => [c.id, c]));
  const staff = await db.query.users.findMany({ where: eq(users.promoteurId, session.promoteurId!) });
  const userById = new Map(staff.map((u) => [u.id, u]));

  const all = (await db.query.paiements.findMany({ orderBy: [desc(paiements.createdAt)] })).filter((p) =>
    bienById.has(p.bienId),
  );
  const enAttente = all.filter((p) => p.statut === "EN_ATTENTE_COMPTABLE");
  const valides = all.filter((p) => p.statut === "VALIDE");

  // 9.3 / 12.2 — syndic en attente de validation
  const syndicsEnAttente = (await db.query.syndics.findMany({ where: eq(syndics.statut, "EN_ATTENTE_VALIDATION") })).filter((s) =>
    bienById.has(s.bienId),
  );

  // 9.3 — biens vendus par commercial
  const ventes = (await db.query.propositions.findMany({ where: eq(propositions.statut, "ACCEPTEE") }))
    .filter((p) => bienById.has(p.bienId))
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0));

  const auteur = (p: (typeof all)[number]) => {
    if (p.saisiParClientId) return "Client";
    const u = p.saisiParId ? userById.get(p.saisiParId) : null;
    return u ? `${u.prenom} ${u.nom}` : "—";
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Paiements"
        description="Opérations saisies par les commerciaux, les clients et le recouvrement — à référencer puis valider."
      />

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">
          En attente de référence / validation{" "}
          <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
            {enAttente.length}
          </span>
        </h2>
        {enAttente.length === 0 ? (
          <EmptyState title="Aucune opération en attente" description="Les paiements saisis apparaîtront ici." />
        ) : (
          <div className="space-y-4">
            {enAttente.map((p) => {
              const bien = bienById.get(p.bienId);
              const client = clientById.get(p.clientId);
              return (
                <Card key={p.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-navy-900">
                        {bien ? (
                          <Link href={`/dashboard/biens/${bien.id}`} className="hover:underline">
                            {bien.designation}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {p.trancheNumero && <span className="ml-2 text-xs text-navy-400">Tranche {p.trancheNumero}</span>}
                      </p>
                      <p className="text-xs text-navy-400">
                        {client ? `${client.prenom} ${client.nom}` : "—"} · saisi par {auteur(p)} le {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-navy-900">{formatMoney(p.montant, p.devise)}</p>
                      <p className="text-xs text-navy-400">
                        {p.natureOperation} · {p.banque} · {formatDate(p.dateOperation)}
                        {p.natureOperation === "cheque" && ` · encaissement ${formatDate(p.dateEncaissementCheque)}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs">
                    <span className="text-navy-400">Porteur déclaré : {p.porteur ?? "—"}</span>
                    {p.preuveUrl && (
                      <a href={p.preuveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-600 hover:underline">
                        <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
                      </a>
                    )}
                    {p.porteurPieceUrl && (
                      <a href={p.porteurPieceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-600 hover:underline">
                        <Paperclip className="h-3.5 w-3.5" /> Pièce du porteur
                      </a>
                    )}
                  </div>
                  {isComptable && (
                    <div className="mt-4">
                      <CompleterForm paiementId={p.id} montant={p.montant} porteur={p.porteur} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">Paiements validés</h2>
        {valides.length === 0 ? (
          <EmptyState title="Aucun paiement validé" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                  <th className="px-5 py-3 font-medium">Bien</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Tranche</th>
                  <th className="px-5 py-3 font-medium">Montant reçu</th>
                  <th className="px-5 py-3 font-medium">Référence</th>
                  <th className="px-5 py-3 font-medium">Réception</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {valides.map((p) => {
                  const bien = bienById.get(p.bienId);
                  const client = clientById.get(p.clientId);
                  return (
                    <tr key={p.id} className="border-b border-navy-50 last:border-0">
                      <td className="px-5 py-3 font-medium text-navy-900">{bien?.designation ?? "—"}</td>
                      <td className="px-5 py-3 text-navy-400">{client ? `${client.prenom} ${client.nom}` : "—"}</td>
                      <td className="px-5 py-3 text-navy-400">{p.trancheNumero ? `Tranche ${p.trancheNumero}` : "—"}</td>
                      <td className="px-5 py-3 text-navy-900">{formatMoney(p.montantExact ?? p.montant, p.devise)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-navy-900">{p.reference ?? "—"}</td>
                      <td className="px-5 py-3 text-navy-400">{formatDate(p.dateReception)}</td>
                      <td className="px-5 py-3">
                        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Validé</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {p.recuPdfUrl && (
                          <a href={p.recuPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline">
                            <FileDown className="h-3.5 w-3.5" /> Reçu
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">
          Syndic en attente de validation{" "}
          <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
            {syndicsEnAttente.length}
          </span>
        </h2>
        {syndicsEnAttente.length === 0 ? (
          <EmptyState title="Aucun paiement de syndic à valider" />
        ) : (
          <Card className="divide-y divide-navy-50">
            {syndicsEnAttente.map((s) => {
              const bien = bienById.get(s.bienId);
              const client = clientById.get(s.clientId);
              return (
                <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-medium text-navy-900">
                      {bien?.designation ?? "—"} <span className="ml-2 text-xs font-normal text-navy-400">Syndic {s.periode ?? ""}</span>
                    </p>
                    <p className="text-xs text-navy-400">
                      {client ? `${client.prenom} ${client.nom}` : "—"} · {s.natureOperation} · {s.banque} · {formatDate(s.dateOperation)} · porteur {s.porteur}
                    </p>
                    {s.preuveUrl && (
                      <a href={s.preuveUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-gold-600 hover:underline">
                        <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-navy-900">{formatMoney(s.montant)}</p>
                    {isComptable && (
                      <div className="mt-2">
                        <ValiderSyndicButton syndicId={s.id} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">Biens vendus par commercial</h2>
        {ventes.length === 0 ? (
          <EmptyState title="Aucune vente conclue" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                  <th className="px-5 py-3 font-medium">Commercial</th>
                  <th className="px-5 py-3 font-medium">Nature</th>
                  <th className="px-5 py-3 font-medium">Désignation</th>
                  <th className="px-5 py-3 font-medium">Prix</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Date de vente</th>
                </tr>
              </thead>
              <tbody>
                {ventes.map((v) => {
                  const bien = bienById.get(v.bienId);
                  const client = clientById.get(v.clientId);
                  const com = userById.get(v.commercialId);
                  return (
                    <tr key={v.id} className="border-b border-navy-50 last:border-0">
                      <td className="px-5 py-3 text-navy-900">{com ? `${com.prenom} ${com.nom}` : "—"}</td>
                      <td className="px-5 py-3 text-navy-400">{bien?.nature ?? "—"}</td>
                      <td className="px-5 py-3 font-medium text-navy-900">{bien?.designation ?? "—"}</td>
                      <td className="px-5 py-3 text-navy-900">{bien ? formatMoney(bien.prix) : "—"}</td>
                      <td className="px-5 py-3 text-navy-400">{client ? `${client.prenom} ${client.nom}` : "—"}</td>
                      <td className="px-5 py-3 text-navy-400">{formatDate(v.decidedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
