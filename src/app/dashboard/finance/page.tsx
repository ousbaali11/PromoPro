import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { paiements, biens, projets, clients, echeances, propositions, desistements } from "@/db/schema";
import { Card, EmptyState, PageHeader, Badge } from "@/components/ui/Primitives";
import { formatMoney, formatDate } from "@/lib/utils";
import { calculerTresorerie, dateTresorerie, montantValide } from "@/lib/tresorerie";

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-navy-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-gold-600" : "text-navy-900"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
    </Card>
  );
}

/** Section 8 — tableau de bord trésorerie du Directeur Financier. */
export default async function FinancePage() {
  const session = await requireRole(["DIRECTEUR_FINANCIER", "PDG"]);

  const projetById = new Map(
    (await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) })).map((p) => [p.id, p]),
  );
  const bienById = new Map((await db.query.biens.findMany()).filter((b) => projetById.has(b.projetId)).map((b) => [b.id, b]));
  const clientById = new Map(
    (await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) })).map((c) => [c.id, c]),
  );

  const tousPaiements = (await db.query.paiements.findMany()).filter((p) => bienById.has(p.bienId));
  const ventes = (await db.query.propositions.findMany({ where: eq(propositions.statut, "ACCEPTEE") })).filter((p) => bienById.has(p.bienId));
  const toutesEcheances = ventes.length
    ? await db.query.echeances.findMany({ where: inArray(echeances.propositionId, ventes.map((v) => v.id)) })
    : [];
  const remboursements = (await db.query.desistements.findMany()).filter((d) => bienById.has(d.bienId) && d.statut !== "REMBOURSE");

  const t = calculerTresorerie(tousPaiements, toutesEcheances);
  const libelle = (p: (typeof tousPaiements)[number]) => {
    const bien = bienById.get(p.bienId);
    const client = clientById.get(p.clientId);
    return `${client ? `${client.prenom} ${client.nom}` : "—"} · ${bien?.designation ?? "—"}`;
  };

  const LignePaiement = ({ p }: { p: (typeof tousPaiements)[number] }) => (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate text-navy-900">{libelle(p)}</p>
        <p className="text-xs text-navy-400">
          {formatDate(dateTresorerie(p))} · {p.natureOperation} · {p.banque}
          {p.reference && ` · ${p.reference}`}
        </p>
      </div>
      <span className="shrink-0 font-medium text-navy-900">{formatMoney(montantValide(p), p.devise)}</span>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Trésorerie"
        description="Paiements validés par le Comptable Interne : portefeuille chèques, virements et versements, entrées à venir."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total du jour" value={formatMoney(t.totalDuJour)} hint="Réceptions et encaissements datés d'aujourd'hui" accent />
        <Stat label="Total à 7 jours" value={formatMoney(t.totalA7Jours)} hint="D'aujourd'hui à J+7 (paiements validés)" accent />
        <Stat label="Chèques encaissés" value={formatMoney(t.totalChequesEncaisses)} hint={`${t.chequesEncaisses.length} chèque(s)`} />
        <Stat label="Chèques à venir" value={formatMoney(t.totalChequesAVenir)} hint={`${t.chequesAVenir.length} chèque(s) à encaisser`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-navy-900">Portefeuille chèques</h2>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-navy-400">À encaisser</h3>
            {t.chequesAVenir.length === 0 ? (
              <EmptyState title="Aucun chèque à venir" />
            ) : (
              <Card className="divide-y divide-navy-50">
                {t.chequesAVenir
                  .sort((a, b) => (dateTresorerie(a)?.getTime() ?? 0) - (dateTresorerie(b)?.getTime() ?? 0))
                  .map((p) => (
                    <LignePaiement key={p.id} p={p} />
                  ))}
              </Card>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-navy-400">Encaissés</h3>
            {t.chequesEncaisses.length === 0 ? (
              <EmptyState title="Aucun chèque encaissé" />
            ) : (
              <Card className="divide-y divide-navy-50">
                {t.chequesEncaisses
                  .sort((a, b) => (dateTresorerie(b)?.getTime() ?? 0) - (dateTresorerie(a)?.getTime() ?? 0))
                  .map((p) => (
                    <LignePaiement key={p.id} p={p} />
                  ))}
              </Card>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-navy-900">Virements &amp; versements</h2>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-navy-400">
              Du jour <span className="ml-1 normal-case text-navy-900">{formatMoney(t.totalVirementsDuJour)}</span>
            </h3>
            {t.virementsDuJour.length === 0 ? (
              <EmptyState title="Aucun virement reçu aujourd'hui" />
            ) : (
              <Card className="divide-y divide-navy-50">
                {t.virementsDuJour.map((p) => (
                  <LignePaiement key={p.id} p={p} />
                ))}
              </Card>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-navy-400">
              À venir — échéances connues{" "}
              <span className="ml-1 normal-case text-navy-900">{formatMoney(t.totalEcheancesA7Jours)} à 7 jours</span>
            </h3>
            {t.echeancesAVenir.length === 0 ? (
              <EmptyState title="Aucune échéance à venir" />
            ) : (
              <Card className="divide-y divide-navy-50">
                {t.echeancesAVenir.slice(0, 12).map((e) => {
                  const bien = bienById.get(e.bienId);
                  const client = bien?.clientId ? clientById.get(bien.clientId) : null;
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-navy-900">
                          {client ? `${client.prenom} ${client.nom}` : "—"} ·{" "}
                          {bien ? (
                            <Link href={`/dashboard/biens/${bien.id}`} className="hover:underline">
                              {bien.designation}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </p>
                        <p className="text-xs text-navy-400">
                          {formatDate(e.dateEcheance)} · tranche {e.numero} ({e.pourcentage}%)
                          {e.statut === "PARTIELLE" && " · partiellement réglée"}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium text-navy-900">{formatMoney(e.restant)}</span>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-navy-400">
              Historique <span className="ml-1 normal-case text-navy-900">{formatMoney(t.totalVirements)}</span>
            </h3>
            {t.virements.length === 0 ? (
              <EmptyState title="Aucun virement validé" />
            ) : (
              <Card className="divide-y divide-navy-50">
                {t.virements
                  .sort((a, b) => (dateTresorerie(b)?.getTime() ?? 0) - (dateTresorerie(a)?.getTime() ?? 0))
                  .slice(0, 12)
                  .map((p) => (
                    <LignePaiement key={p.id} p={p} />
                  ))}
              </Card>
            )}
          </div>
        </section>
      </div>

      {remboursements.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-navy-900">Remboursements à organiser (désistements)</h2>
          <Card className="divide-y divide-navy-50">
            {remboursements.map((d) => {
              const bien = bienById.get(d.bienId);
              const client = clientById.get(d.clientId);
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="text-navy-900">
                      {client ? `${client.prenom} ${client.nom}` : "—"} · {bien?.designation ?? "—"}
                    </p>
                    <p className="text-xs text-navy-400">Désistement du {formatDate(d.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={d.statut === "VERIFIE" ? "bg-sky-50 text-sky-700 ring-sky-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}>
                      {d.statut === "VERIFIE" ? "Papiers vérifiés" : "En vérification"}
                    </Badge>
                    <span className="font-medium text-rose-700">− {formatMoney(d.montantARembourser)}</span>
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
}
