import Link from "next/link";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { CalendarClock, AlertTriangle, Wallet } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { projets, clients, echeances, propositions } from "@/db/schema";
import { Card, EmptyState, PageHeader, Section, Stat } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { formatMoney, formatDate } from "@/lib/utils";
import { NomCompte } from "@/components/ui/EtatCompte";
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

  // Server Component : rendu une fois par requête, l'horloge y est stable
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const totalDu = rows.reduce((s, e) => s + Math.max(0, e.montant - e.montantPaye), 0);
  const enRetard = rows.filter((e) => e.statut !== "PAYEE" && e.dateEcheance.getTime() < now);

  // Regroupement par bien pour le bouton « Ajouter un paiement »
  const groupes = new Map<string, typeof rows>();
  for (const e of rows) groupes.set(e.bienId, [...(groupes.get(e.bienId) ?? []), e]);

  const etat = (e: (typeof rows)[number]) => {
    const late = e.statut !== "PAYEE" && e.dateEcheance.getTime() < now;
    if (e.statut === "PAYEE") return { statut: "PAYEE", label: "Payée", tone: "success" as const };
    if (late) return { statut: "RETARD", label: "En retard", tone: "danger" as const };
    if (e.statut === "PARTIELLE") return { statut: "PARTIELLE", label: "Partielle", tone: "info" as const };
    return { statut: "A_VENIR", label: "À venir", tone: "warning" as const };
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Recouvrement"
        description="Échéanciers de toutes les ventes : vert = payé, rouge = en retard. Filtrez par période pour identifier les clients à relancer."
      />

      <Section title="Rendez-vous" testId="section-rendez-vous">
        <RendezVousSection service="RECOUVREMENT" session={session} canAct={isRecouvrement} />
      </Section>

      <Section title="Échéances" className="space-y-4" testId="section-echeances">
        <PeriodeFilter periode={periode} du={du} au={au} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label={`${bornes ? bornes.label : "Toutes périodes"} · échéances`} value={rows.length} icon={<CalendarClock />} />
          <Stat label="Restant dû sur la période" value={formatMoney(totalDu)} icon={<Wallet />} />
          <Stat
            label="En retard"
            value={enRetard.length}
            tone={enRetard.length ? "danger" : undefined}
            icon={<AlertTriangle />}
            hint={enRetard.length ? "Clients à relancer" : "Aucun retard"}
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Aucune échéance"
            description={bornes ? `Aucune échéance ${bornes.label.toLowerCase()}.` : "Les échéanciers des ventes conclues apparaîtront ici."}
          />
        ) : (
          <div className="space-y-4">
            {[...groupes.entries()].map(([bienId, liste]) => {
              const bien = bienById.get(bienId)!;
              const client = bien.clientId ? clientById.get(bien.clientId) : null;
              const complet = echeancierParBien.get(bienId) ?? liste;
              const retardBien = liste.some((e) => e.statut !== "PAYEE" && e.dateEcheance.getTime() < now);
              return (
                <Card key={bienId} accent={retardBien ? "danger" : undefined} className="overflow-hidden" data-testid="recouvrement-bien">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-50 px-5 py-3">
                    <div>
                      <Link
                        href={`/dashboard/biens/${bien.id}`}
                        className="rounded-xs text-h3 text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                      >
                        {bien.designation}
                      </Link>
                      <span className="ml-2 text-caption text-navy-400">{projetById.get(bien.projetId)?.nom}</span>
                    </div>
                    <div className="text-small text-navy-400">
                      {client ? (
                        <Link
                          href={`/dashboard/clients/${client.id}`}
                          className="rounded-xs font-medium text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          <NomCompte compte={client} />
                        </Link>
                      ) : (
                        "—"
                      )}
                      {client?.telephone1 && <span className="tabular"> · {client.telephone1}</span>}
                    </div>
                  </div>
                  <div className="[&>div]:rounded-none [&>div]:shadow-none [&>div]:ring-0">
                    <DataTable
                      caption={`Échéances de ${bien.designation}`}
                      dense
                      minWidth={560}
                      columns={[
                        { header: "Tranche" },
                        { header: "Montant", align: "right" },
                        { header: "Restant dû", align: "right" },
                        { header: "Échéance", hideBelow: "sm" },
                        { header: "Statut" },
                      ]}
                      rows={liste.map((e) => {
                        const s = etat(e);
                        return {
                          key: e.id,
                          testId: "ligne-echeance",
                          accent: s.statut === "RETARD" ? "danger" : undefined,
                          cells: [
                            <span key="t" className="font-medium">
                              Tranche {e.numero} · {e.pourcentage}%
                            </span>,
                            <span key="m" className="tabular">
                              {formatMoney(e.montant)}
                            </span>,
                            <span key="r" className={s.statut === "RETARD" ? "tabular font-medium text-danger-fg" : "tabular text-navy-400"}>
                              {formatMoney(Math.max(0, e.montant - e.montantPaye))}
                            </span>,
                            <span key="d" className="tabular text-navy-400">
                              {formatDate(e.dateEcheance)}
                            </span>,
                            <StatusBadge key="s" statut={s.statut} label={s.label} tone={s.tone} />,
                          ],
                        };
                      })}
                    />
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
      </Section>
    </div>
  );
}
