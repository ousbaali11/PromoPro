import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { Banknote, CalendarClock, Landmark, Receipt, Wallet } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { projets, clients, echeances, propositions } from "@/db/schema";
import { Card, EmptyState, PageHeader, Badge, Section, Stat } from "@/components/ui/Primitives";
import { formatMoney, formatDate } from "@/lib/utils";
import { NomCompte } from "@/components/ui/EtatCompte";
import { calculerTresorerie, dateTresorerie, montantValide } from "@/lib/tresorerie";
import { projeterEcheances } from "@/lib/projection";
import { ProjectionTresorerie } from "@/components/finance/ProjectionTresorerie";

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

  // Projection théorique à 90 jours : échéances non soldées des ventes en cours (propositions acceptées), empilées par projet
  const projection = projeterEcheances(
    toutesEcheances.map((e) => {
      const projet = projetById.get(bienById.get(e.bienId)?.projetId ?? "");
      return {
        id: e.id,
        montant: e.montant,
        montantPaye: e.montantPaye,
        statut: e.statut,
        dateEcheance: e.dateEcheance,
        segmentCle: projet?.id ?? "inconnu",
        segmentLibelle: projet?.nom ?? "Projet inconnu",
      };
    }),
  );
  const libelle = (p: (typeof tousPaiements)[number]) => {
    const bien = bienById.get(p.bienId);
    const client = clientById.get(p.clientId);
    return (
      <>
        <NomCompte compte={client} /> · {bien?.designation ?? "—"}
      </>
    );
  };

  const lignePaiement = (p: (typeof tousPaiements)[number]) => (
    <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-small" data-testid="ligne-tresorerie">
      <div className="min-w-0">
        <p className="truncate font-medium text-navy-900">{libelle(p)}</p>
        <p className="text-caption text-navy-400">
          <span className="tabular">{formatDate(dateTresorerie(p))}</span> · {p.natureOperation} · {p.banque}
          {p.reference && <span className="font-mono"> · {p.reference}</span>}
        </p>
      </div>
      <span className="shrink-0 tabular font-semibold text-navy-900">{formatMoney(montantValide(p), p.devise)}</span>
    </div>
  );

  const bloc = (titre: string, montant: string | undefined, liste: React.ReactNode[], vide: string) => (
    <div>
      <h3 className="mb-2 flex items-baseline justify-between text-label uppercase text-navy-400">
        {titre}
        {montant && <span className="normal-case tabular text-small font-semibold tracking-normal text-navy-900">{montant}</span>}
      </h3>
      {liste.length === 0 ? (
        <EmptyState title={vide} className="py-6" />
      ) : (
        <Card className="divide-y divide-navy-50">{liste}</Card>
      )}
    </div>
  );

  const parDateAsc = (a: (typeof tousPaiements)[number], b: (typeof tousPaiements)[number]) =>
    (dateTresorerie(a)?.getTime() ?? 0) - (dateTresorerie(b)?.getTime() ?? 0);
  const parDateDesc = (a: (typeof tousPaiements)[number], b: (typeof tousPaiements)[number]) => -parDateAsc(a, b);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Trésorerie"
        description="Paiements validés par le Comptable Interne : portefeuille chèques, virements et versements, entrées à venir."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total du jour" value={formatMoney(t.totalDuJour)} hint="Réceptions et encaissements datés d'aujourd'hui" accent icon={<Wallet />} />
        <Stat label="Total à 7 jours" value={formatMoney(t.totalA7Jours)} hint="D'aujourd'hui à J+7 (paiements validés)" accent icon={<CalendarClock />} />
        <Stat label="Chèques encaissés" value={formatMoney(t.totalChequesEncaisses)} hint={`${t.chequesEncaisses.length} chèque(s)`} icon={<Receipt />} />
        <Stat label="Chèques à venir" value={formatMoney(t.totalChequesAVenir)} hint={`${t.chequesAVenir.length} chèque(s) à encaisser`} icon={<Landmark />} />
      </div>

      <Section
        title="Projection à 30, 60 et 90 jours"
        description="Montants attendus des échéances déjà connues des ventes en cours, si chacune est payée à sa date."
        testId="section-projection"
      >
        <ProjectionTresorerie projection={projection} />
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Portefeuille chèques" className="space-y-4" testId="section-cheques">
          {bloc("À encaisser", undefined, [...t.chequesAVenir].sort(parDateAsc).map(lignePaiement), "Aucun chèque à venir")}
          {bloc("Encaissés", undefined, [...t.chequesEncaisses].sort(parDateDesc).map(lignePaiement), "Aucun chèque encaissé")}
        </Section>

        <Section title="Virements & versements" className="space-y-4" testId="section-virements">
          {bloc("Du jour", formatMoney(t.totalVirementsDuJour), t.virementsDuJour.map(lignePaiement), "Aucun virement reçu aujourd'hui")}
          {bloc(
            "À venir — échéances connues",
            `${formatMoney(t.totalEcheancesA7Jours)} à 7 jours`,
            t.echeancesAVenir.slice(0, 12).map((e) => {
              const bien = bienById.get(e.bienId);
              const client = bien?.clientId ? clientById.get(bien.clientId) : null;
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-small" data-testid="ligne-echeance-a-venir">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy-900">
                      <NomCompte compte={client} /> ·{" "}
                      {bien ? (
                        <Link href={`/dashboard/biens/${bien.id}`} className="rounded-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
                          {bien.designation}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </p>
                    <p className="text-caption text-navy-400">
                      <span className="tabular">{formatDate(e.dateEcheance)}</span> · tranche {e.numero} ({e.pourcentage}%)
                      {e.statut === "PARTIELLE" && " · partiellement réglée"}
                    </p>
                  </div>
                  <span className="shrink-0 tabular font-semibold text-navy-900">{formatMoney(e.restant)}</span>
                </div>
              );
            }),
            "Aucune échéance à venir",
          )}
          {bloc("Historique", formatMoney(t.totalVirements), [...t.virements].sort(parDateDesc).slice(0, 12).map(lignePaiement), "Aucun virement validé")}
        </Section>
      </div>

      {remboursements.length > 0 && (
        <Section title="Remboursements à organiser (désistements)" count={remboursements.length} countTone="danger" testId="section-remboursements">
          <Card className="divide-y divide-navy-50">
            {remboursements.map((d) => {
              const bien = bienById.get(d.bienId);
              const client = clientById.get(d.clientId);
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-small" data-testid="ligne-remboursement">
                  <div>
                    <p className="font-medium text-navy-900">
                      <NomCompte compte={client} /> · {bien?.designation ?? "—"}
                    </p>
                    <p className="text-caption text-navy-400">Désistement du {formatDate(d.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={d.statut === "VERIFIE" ? "info" : "warning"} dot>
                      {d.statut === "VERIFIE" ? "Papiers vérifiés" : "En vérification"}
                    </Badge>
                    <span className="inline-flex items-center gap-1 tabular font-semibold text-danger-fg">
                      <Banknote className="h-4 w-4" /> − {formatMoney(d.montantARembourser)}
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>
      )}
    </div>
  );
}
