import Link from "next/link";
import { NomCompte } from "@/components/ui/EtatCompte";
import { desc, eq } from "drizzle-orm";
import { FileDown, Paperclip, Receipt, Building, Wallet, HandCoins } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { paiements, projets, clients, users, propositions, syndics } from "@/db/schema";
import { Card, Badge, EmptyState, PageHeader, Section, Stat } from "@/components/ui/Primitives";
import { DataTable } from "@/components/ui/DataTable";
import { formatMoney, formatDate } from "@/lib/utils";
import { CompleterForm } from "./CompleterForm";
import { ValiderSyndicButton } from "./ValiderSyndicButton";

const lien =
  "inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus";

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
  const totalValide = valides.reduce((s, p) => s + (p.montantExact ?? p.montant), 0);

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
    return u ? <NomCompte compte={u} /> : "—";
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Paiements"
        description="Opérations saisies par les commerciaux, les clients et le recouvrement — à référencer puis valider."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="En attente" value={enAttente.length} tone={enAttente.length > 0 ? "warning" : undefined} icon={<Wallet />} hint="Référence et validation à saisir" />
        <Stat label="Validés" value={formatMoney(totalValide)} icon={<Receipt />} hint={`${valides.length} opération${valides.length > 1 ? "s" : ""}`} />
        <Stat label="Syndic à valider" value={syndicsEnAttente.length} tone={syndicsEnAttente.length > 0 ? "warning" : undefined} icon={<Building />} />
      </div>

      <Section
        title="En attente de référence / validation"
        count={enAttente.length}
        countTone={enAttente.length > 0 ? "warning" : "neutral"}
        testId="section-paiements-attente"
      >
        {enAttente.length === 0 ? (
          <EmptyState icon={<Wallet />} title="Aucune opération en attente" description="Les paiements saisis apparaîtront ici." />
        ) : (
          <div className="space-y-4">
            {enAttente.map((p) => {
              const bien = bienById.get(p.bienId);
              const client = clientById.get(p.clientId);
              return (
                <Card key={p.id} accent="warning" className="p-5" data-testid="paiement-attente">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-h3 text-navy-900">
                        {bien ? (
                          <Link href={`/dashboard/biens/${bien.id}`} className="rounded-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
                            {bien.designation}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {p.trancheNumero && (
                          <Badge tone="neutral" className="ml-2 align-middle">
                            Tranche {p.trancheNumero}
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-small text-navy-400">
                        <NomCompte compte={client} /> · saisi par {auteur(p)} le {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-price tabular text-navy-900">{formatMoney(p.montant, p.devise)}</p>
                      <p className="text-caption text-navy-400">
                        {p.natureOperation} · {p.banque} · {formatDate(p.dateOperation)}
                        {p.natureOperation === "cheque" && ` · encaissement ${formatDate(p.dateEncaissementCheque)}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-caption">
                    <span className="text-navy-400">
                      Porteur déclaré : <span className="font-medium text-navy-900">{p.porteur ?? "—"}</span>
                    </span>
                    {p.preuveUrl && (
                      <a href={p.preuveUrl} target="_blank" rel="noreferrer" className={lien}>
                        <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
                      </a>
                    )}
                    {p.porteurPieceUrl && (
                      <a href={p.porteurPieceUrl} target="_blank" rel="noreferrer" className={lien}>
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
      </Section>

      <Section title="Paiements validés" count={valides.length > 0 ? valides.length : undefined} testId="section-paiements-valides">
        <DataTable
          testId="table-paiements-valides"
          caption="Paiements validés"
          minWidth={720}
          defaultSort={{ column: 5, sens: "desc" }}
          exportation={{ nom: "paiements-valides", entetes: ["Bien", "Client", "Tranche", "Montant reçu", "Devise", "Référence", "Réception", "Statut"] }}
          columns={[
            { header: "Bien", sortable: true },
            { header: "Client", hideBelow: "sm" },
            { header: "Tranche", hideBelow: "md" },
            { header: "Montant reçu", align: "right", sortable: true },
            { header: "Référence" },
            { header: "Réception", sortable: true, hideBelow: "lg" },
            { header: "Statut" },
            { header: <span className="sr-only">Reçu</span>, align: "right", width: "1%" },
          ]}
          rows={valides.map((p) => {
            const bien = bienById.get(p.bienId);
            const client = clientById.get(p.clientId);
            return {
              key: p.id,
              testId: "paiement-valide",
              sort: [bien?.designation ?? "", null, null, p.montantExact ?? p.montant, null, p.dateReception ? new Date(p.dateReception).getTime() : 0, null, null],
              export: [
                bien?.designation ?? "",
                client ? `${client.prenom} ${client.nom}` : "",
                p.trancheNumero ?? "",
                p.montantExact ?? p.montant,
                p.devise,
                p.reference ?? "",
                p.dateReception ? new Date(p.dateReception) : null,
                "Validé",
              ],
              cells: [
                <span key="bien" className="font-medium">
                  {bien?.designation ?? "—"}
                </span>,
                <span key="client" className="text-navy-400">
                  <NomCompte compte={client} />
                </span>,
                <span key="tranche" className="text-navy-400">
                  {p.trancheNumero ? `Tranche ${p.trancheNumero}` : "—"}
                </span>,
                <span key="montant" className="tabular">
                  {formatMoney(p.montantExact ?? p.montant, p.devise)}
                </span>,
                <span key="ref" className="font-mono text-caption">
                  {p.reference ?? "—"}
                </span>,
                <span key="date" className="tabular text-navy-400">
                  {formatDate(p.dateReception)}
                </span>,
                <Badge key="statut" tone="success" dot>
                  Validé
                </Badge>,
                p.recuPdfUrl ? (
                  <a key="recu" href={p.recuPdfUrl} target="_blank" rel="noreferrer" className={lien}>
                    <FileDown className="h-3.5 w-3.5" /> Reçu
                  </a>
                ) : (
                  ""
                ),
              ],
            };
          })}
          empty={{ icon: <Receipt />, title: "Aucun paiement validé" }}
        />
      </Section>

      <Section
        title="Syndic en attente de validation"
        count={syndicsEnAttente.length}
        countTone={syndicsEnAttente.length > 0 ? "warning" : "neutral"}
        testId="section-syndic"
      >
        {syndicsEnAttente.length === 0 ? (
          <EmptyState icon={<Building />} title="Aucun paiement de syndic à valider" />
        ) : (
          <Card className="divide-y divide-navy-50">
            {syndicsEnAttente.map((s) => {
              const bien = bienById.get(s.bienId);
              const client = clientById.get(s.clientId);
              return (
                <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" data-testid="syndic-attente">
                  <div>
                    <p className="font-medium text-navy-900">
                      {bien?.designation ?? "—"}
                      <Badge tone="neutral" className="ml-2 align-middle">
                        Syndic {s.periode ?? ""}
                      </Badge>
                    </p>
                    <p className="text-caption text-navy-400">
                      <NomCompte compte={client} /> · {s.natureOperation} · {s.banque} · {formatDate(s.dateOperation)} · porteur {s.porteur}
                    </p>
                    {s.preuveUrl && (
                      <a href={s.preuveUrl} target="_blank" rel="noreferrer" className={`${lien} mt-1`}>
                        <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-price tabular text-navy-900">{formatMoney(s.montant)}</p>
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
      </Section>

      <Section title="Biens vendus par commercial" count={ventes.length > 0 ? ventes.length : undefined} testId="section-ventes">
        <DataTable
          testId="table-ventes"
          caption="Biens vendus par commercial"
          exportation={{ nom: "ventes-par-commercial", entetes: ["Commercial", "Nature", "Désignation", "Prix", "Client", "Date de vente"] }}
          columns={[
            { header: "Commercial", sortable: true },
            { header: "Nature", hideBelow: "md" },
            { header: "Désignation", sortable: true },
            { header: "Prix", align: "right", sortable: true },
            { header: "Client", hideBelow: "sm" },
            { header: "Date de vente", sortable: true, hideBelow: "lg" },
          ]}
          rows={ventes.map((v) => {
            const bien = bienById.get(v.bienId);
            const client = clientById.get(v.clientId);
            const com = userById.get(v.commercialId);
            return {
              key: v.id,
              testId: "vente-ligne",
              sort: [com ? `${com.nom} ${com.prenom}` : "", null, bien?.designation ?? "", bien?.prix ?? 0, null, v.decidedAt?.getTime() ?? 0],
              export: [
                com ? `${com.prenom} ${com.nom}` : "",
                bien?.nature ?? "",
                bien?.designation ?? "",
                bien?.prix ?? null,
                client ? `${client.prenom} ${client.nom}` : "",
                v.decidedAt ?? null,
              ],
              cells: [
                <NomCompte key="com" compte={com} />,
                <span key="nature" className="text-navy-400">
                  {bien?.nature ?? "—"}
                </span>,
                <span key="des" className="font-medium">
                  {bien?.designation ?? "—"}
                </span>,
                <span key="prix" className="tabular">
                  {bien ? formatMoney(bien.prix) : "—"}
                </span>,
                <span key="client" className="text-navy-400">
                  <NomCompte compte={client} />
                </span>,
                <span key="date" className="tabular text-navy-400">
                  {formatDate(v.decidedAt)}
                </span>,
              ],
            };
          })}
          empty={{ icon: <HandCoins />, title: "Aucune vente conclue" }}
        />
      </Section>
    </div>
  );
}
