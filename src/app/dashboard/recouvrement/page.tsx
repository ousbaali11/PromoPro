import Link from "next/link";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets, clients, echeances, propositions } from "@/db/schema";
import { Card, Badge, EmptyState, PageHeader } from "@/components/ui/Primitives";
import { formatMoney, formatDate } from "@/lib/utils";
import { bornesPeriode } from "@/lib/periodes";
import { RendezVousSection } from "@/app/dashboard/rendez-vous/RendezVousSection";
import { PeriodeFilter } from "./PeriodeFilter";
import { AjouterPaiementRecouvrement } from "./AjouterPaiementRecouvrement";

/** Section 13 — suivi des échéanciers, filtres de période, paiement pour le compte du client. */
export default async function RecouvrementPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; du?: string; au?: string }>;
}) {
  const session = await requireRole(["RECOUVREMENT", "DIRECTEUR_FINANCIER", "PDG"]);
  const isRecouvrement = session.role === "RECOUVREMENT";
  const { periode = "", du = "", au = "" } = await searchParams;
  const bornes = bornesPeriode(periode, du, au);

  const projetById = new Map(
    (await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) })).map((p) => [p.id, p]),
  );
  const bienById = new Map((await db.query.biens.findMany()).filter((b) => projetById.has(b.projetId)).map((b) => [b.id, b]));
  const clientById = new Map(
    (await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) })).map((c) => [c.id, c]),
  );

  // Échéanciers des ventes en cours uniquement (propositions acceptées, non désistées)
  const ventes = (await db.query.propositions.findMany({ where: eq(propositions.statut, "ACCEPTEE") })).filter((p) =>
    bienById.has(p.bienId),
  );
  const propositionIds = ventes.map((p) => p.id);

  // 13.2 — filtrage serveur par période (gte / lte sur dateEcheance)
  const conditions = [propositionIds.length ? inArray(echeances.propositionId, propositionIds) : undefined];
  if (bornes) conditions.push(gte(echeances.dateEcheance, bornes.debut), lte(echeances.dateEcheance, bornes.fin));
  const rows = propositionIds.length
    ? await db.query.echeances.findMany({ where: and(...conditions), orderBy: [asc(echeances.dateEcheance), asc(echeances.numero)] })
    : [];

  // Pour le formulaire de paiement : échéancier complet de chaque bien concerné
  const echeancierParBien = new Map<string, typeof rows>();
  if (isRecouvrement && rows.length) {
    const complets = await db.query.echeances.findMany({
      where: inArray(echeances.propositionId, [...new Set(rows.map((r) => r.propositionId))]),
      orderBy: [asc(echeances.numero)],
    });
    for (const e of complets) echeancierParBien.set(e.bienId, [...(echeancierParBien.get(e.bienId) ?? []), e]);
  }

  const now = Date.now();
  const totalDu = rows.reduce((s, e) => s + Math.max(0, e.montant - e.montantPaye), 0);
  const enRetard = rows.filter((e) => e.statut !== "PAYEE" && e.dateEcheance.getTime() < now);

  // Regroupement par bien pour le bouton « Ajouter un paiement »
  const groupes = new Map<string, typeof rows>();
  for (const e of rows) groupes.set(e.bienId, [...(groupes.get(e.bienId) ?? []), e]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Recouvrement"
        description="Échéanciers de toutes les ventes : vert = payé, rouge = en retard. Filtrez par période pour identifier les clients à relancer."
      />

      <section>
        <h2 className="mb-3 text-sm font-medium text-navy-900">Rendez-vous</h2>
        <RendezVousSection service="RECOUVREMENT" session={session} canAct={isRecouvrement} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-navy-900">Échéances</h2>
        <PeriodeFilter periode={periode} du={du} au={au} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-navy-400">{bornes ? bornes.label : "Toutes périodes"} · échéances</p>
            <p className="mt-1 text-2xl font-semibold text-navy-900">{rows.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-navy-400">Restant dû sur la période</p>
            <p className="mt-1 text-2xl font-semibold text-navy-900">{formatMoney(totalDu)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-navy-400">En retard</p>
            <p className={`mt-1 text-2xl font-semibold ${enRetard.length ? "text-rose-700" : "text-navy-900"}`}>{enRetard.length}</p>
          </Card>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="Aucune échéance"
            description={bornes ? `Aucune échéance ${bornes.label.toLowerCase()}.` : "Les échéanciers des ventes conclues apparaîtront ici."}
          />
        ) : (
          <div className="space-y-4">
            {[...groupes.entries()].map(([bienId, liste]) => {
              const bien = bienById.get(bienId)!;
              const client = bien.clientId ? clientById.get(bien.clientId) : null;
              const complet = echeancierParBien.get(bienId) ?? liste;
              return (
                <Card key={bienId} className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-50 px-5 py-3">
                    <div>
                      <Link href={`/dashboard/biens/${bien.id}`} className="font-medium text-navy-900 hover:underline">
                        {bien.designation}
                      </Link>
                      <span className="ml-2 text-xs text-navy-400">{projetById.get(bien.projetId)?.nom}</span>
                    </div>
                    <div className="text-sm text-navy-400">
                      {client ? (
                        <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                          {client.prenom} {client.nom}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {client?.telephone1 && ` · ${client.telephone1}`}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-navy-50 text-left text-xs text-navy-400">
                          <th className="px-5 py-2 font-medium">Tranche</th>
                          <th className="px-5 py-2 font-medium">Montant</th>
                          <th className="px-5 py-2 font-medium">Restant dû</th>
                          <th className="px-5 py-2 font-medium">Échéance</th>
                          <th className="px-5 py-2 font-medium">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liste.map((e) => {
                          const late = e.statut !== "PAYEE" && e.dateEcheance.getTime() < now;
                          const restant = Math.max(0, e.montant - e.montantPaye);
                          return (
                            <tr key={e.id} className="border-b border-navy-50 last:border-0">
                              <td className="px-5 py-2.5 text-navy-900">
                                Tranche {e.numero} · {e.pourcentage}%
                              </td>
                              <td className="px-5 py-2.5 text-navy-900">{formatMoney(e.montant)}</td>
                              <td className="px-5 py-2.5 text-navy-400">{formatMoney(restant)}</td>
                              <td className="px-5 py-2.5 text-navy-400">{formatDate(e.dateEcheance)}</td>
                              <td className="px-5 py-2.5">
                                <Badge
                                  className={
                                    e.statut === "PAYEE"
                                      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                      : late
                                        ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                                        : e.statut === "PARTIELLE"
                                          ? "bg-sky-50 text-sky-700 ring-sky-600/20"
                                          : "bg-amber-50 text-amber-700 ring-amber-600/20"
                                  }
                                >
                                  {e.statut === "PAYEE" ? "Payée" : late ? "En retard" : e.statut === "PARTIELLE" ? "Partielle" : "À venir"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {isRecouvrement && client && ["VENDU", "LIVRE"].includes(bien.statut) && (
                    <div className="border-t border-navy-50 px-5 py-3">
                      <AjouterPaiementRecouvrement
                        bienId={bien.id}
                        clientNom={`${client.prenom} ${client.nom}`}
                        echeances={complet.map((e) => ({
                          id: e.id,
                          numero: e.numero,
                          pourcentage: e.pourcentage,
                          montant: e.montant,
                          montantPaye: e.montantPaye,
                          statut: e.statut,
                        }))}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
