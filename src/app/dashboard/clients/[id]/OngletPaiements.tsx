import { inArray } from "drizzle-orm";
import { Building, CalendarClock, FileDown, Paperclip, Receipt } from "lucide-react";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { SessionPayload } from "@/lib/auth";
import { Badge, Card, EmptyState, Section } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { NomCompte } from "@/components/ui/EtatCompte";
import { formatDate, formatMoney } from "@/lib/utils";
import type { BienDuClient, Client, DossierBien } from "@/lib/dossier-client";
import { PaiementAttenteCarte, lienDoc } from "@/components/dossier/cartes";
import { CompleterForm } from "@/app/dashboard/paiements/CompleterForm";
import { ValiderSyndicButton } from "@/app/dashboard/paiements/ValiderSyndicButton";
import { PaiementForm } from "@/components/paiements/PaiementForm";
import { saisirPaiementCommercial } from "@/app/dashboard/biens/[id]/actions";
import { EditeurEcheancier } from "./EditeurEcheancier";
import { ymd } from "@/lib/echeancier";

const ECH_LABEL: Record<string, string> = { EN_ATTENTE: "En attente", PARTIELLE: "Partielle", PAYEE: "Payée" };
const ECH_TONE = { EN_ATTENTE: "warning", PARTIELLE: "info", PAYEE: "success" } as const;
const SYNDIC_STATUT: Record<string, { label: string; tone: "warning" | "info" | "success" }> = {
  A_PAYER: { label: "À payer", tone: "warning" },
  EN_ATTENTE_VALIDATION: { label: "En attente de validation comptable", tone: "info" },
  PAYE: { label: "Payé", tone: "success" },
};

/** Onglet Échéancier & Paiements : tranches, paiements (validation comptable), syndic, saisie d'un encaissement par le commercial. */
export async function OngletPaiements({
  session,
  client,
  selection,
  dossier,
}: {
  session: SessionPayload;
  client: Client;
  selection: BienDuClient;
  dossier: DossierBien;
}) {
  const { bien } = selection;
  const isComptable = session.role === "COMPTABLE_INTERNE";
  const detenu = bien.clientId === client.id && ["VENDU", "LIVRE"].includes(bien.statut);
  const isCommercialDuBien =
    (session.role === "COMMERCIAL" && bien.commercialId === session.userId) || session.role === "RESPONSABLE_COMMERCIAL";
  const totalPaye = dossier.echeancier.reduce((s, e) => s + e.montantPaye, 0);
  const avancement = bien.prix > 0 ? Math.min(100, Math.round((totalPaye / bien.prix) * 100)) : 0;

  const auteurIds = [...new Set(dossier.paiements.map((p) => p.saisiParId).filter((x): x is string => !!x))];
  const auteurs = auteurIds.length ? await db.query.users.findMany({ where: inArray(users.id, auteurIds) }) : [];
  const auteurById = new Map(auteurs.map((u) => [u.id, u]));
  const auteur = (p: (typeof dossier.paiements)[number]) => {
    if (p.saisiParClientId) return "Client";
    const u = p.saisiParId ? auteurById.get(p.saisiParId) : null;
    return u ? <NomCompte compte={u} /> : "—";
  };
  const enAttente = dossier.paiements.filter((p) => p.statut === "EN_ATTENTE_COMPTABLE");
  const valides = dossier.paiements.filter((p) => p.statut === "VALIDE");
  const annules = dossier.paiements.filter((p) => p.statut === "ANNULE_DESISTEMENT");

  return (
    <div className="space-y-6">
      <Section
        title="Échéancier de paiement"
        description={dossier.echeancier.length > 0 ? `${formatMoney(totalPaye)} payés sur ${formatMoney(bien.prix)}` : undefined}
        testId="section-echeancier"
        action={
          dossier.echeancier.length > 0 ? (
            <div className="w-40">
              <div className="flex justify-between text-caption text-navy-400">
                <span>Encaissé</span>
                <span className="tabular font-medium text-navy-900">{avancement}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-navy-50">
                <div className="h-full rounded-full bg-gold" style={{ width: `${avancement}%` }} />
              </div>
            </div>
          ) : undefined
        }
      >
        <DataTable
          testId="table-echeancier"
          caption="Échéancier de paiement"
          minWidth={520}
          columns={[
            { header: "Tranche" },
            { header: "Montant", align: "right" },
            { header: "Payé", align: "right", hideBelow: "sm" },
            { header: "Échéance", hideBelow: "md" },
            { header: "Statut" },
          ]}
          rows={dossier.echeancier.map((e) => ({
            key: e.id,
            testId: "ligne-echeance",
            cells: [
              <span key="t" className="font-medium">
                Tranche {e.numero} · {e.pourcentage}%
              </span>,
              <span key="m" className="tabular">
                {formatMoney(e.montant)}
              </span>,
              <span key="p" className="tabular text-navy-400">
                {formatMoney(e.montantPaye)}
              </span>,
              <span key="d" className="tabular text-navy-400">
                {formatDate(e.dateEcheance)}
              </span>,
              <StatusBadge key="s" statut={e.statut} label={ECH_LABEL[e.statut] ?? e.statut} tone={ECH_TONE[e.statut as keyof typeof ECH_TONE] ?? "neutral"} />,
            ],
          }))}
          empty={{ title: "Échéancier non disponible", description: "Aucune tranche n'a été définie pour cette vente.", icon: <CalendarClock /> }}
        />
        {detenu && isCommercialDuBien && dossier.proposition?.statut === "ACCEPTEE" && dossier.echeancier.length > 0 && (
          <div className="mt-4">
            <EditeurEcheancier
              key={dossier.echeancier.map((e) => `${e.id}:${e.numero}:${e.pourcentage}`).join("|")}
              bienId={bien.id}
              prix={bien.prix}
              tranches={dossier.echeancier.map((e) => ({ id: e.id, numero: e.numero, pourcentage: e.pourcentage, montantPaye: e.montantPaye, statut: e.statut, date: ymd(new Date(e.dateEcheance)) }))}
            />
          </div>
        )}
      </Section>

      <Section
        title="Paiements à traiter"
        count={enAttente.length}
        countTone={enAttente.length > 0 ? "warning" : "neutral"}
        description={isComptable ? "Complétez la référence, le montant exact reçu, la date de réception et le porteur, puis validez : un reçu PDF est généré." : undefined}
        testId="section-paiements-attente"
      >
        {enAttente.length === 0 ? (
          <EmptyState icon={<Receipt />} title="Aucune opération en attente" description="Les paiements saisis par le commercial ou le client apparaîtront ici." />
        ) : (
          <div className="space-y-4">
            {enAttente.map((p) => (
              <PaiementAttenteCarte
                key={p.id}
                paiement={p}
                bien={bien}
                client={client}
                auteur={auteur(p)}
                avecLiens={false}
                actions={isComptable ? <CompleterForm paiementId={p.id} montant={p.montant} porteur={p.porteur} /> : undefined}
              />
            ))}
          </div>
        )}
      </Section>

      {annules.length > 0 && (
        <Section
          title="Annulés par désistement"
          count={annules.length}
          description="Opérations saisies avant le désistement du client, annulées automatiquement : rien à référencer ni à valider. Preuve et saisie restent consultables."
          testId="section-paiements-annules"
        >
          <Card className="divide-y divide-navy-50">
            {annules.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small" data-testid="paiement-annule">
                <div>
                  <p className="font-medium text-navy-900">
                    <span className="tabular">{formatMoney(p.montant, p.devise)}</span>
                    {p.trancheNumero && <span className="ml-2 text-caption font-normal text-navy-400">Tranche {p.trancheNumero}</span>}
                  </p>
                  <p className="text-caption text-navy-400">
                    {p.natureOperation} · {p.banque} · {formatDate(p.dateOperation)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {p.preuveUrl && (
                    <a href={p.preuveUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                      <Paperclip className="h-3.5 w-3.5" /> Preuve
                    </a>
                  )}
                  <Badge tone="neutral" dot>
                    Annulé (désistement)
                  </Badge>
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Paiements validés" count={valides.length > 0 ? valides.length : undefined} testId="section-paiements-valides">
        {valides.length === 0 ? (
          <EmptyState icon={<Receipt />} title="Aucun paiement validé" />
        ) : (
          <Card className="divide-y divide-navy-50">
            {valides.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small" data-testid="ligne-paiement">
                <div>
                  <p className="font-medium text-navy-900">
                    <span className="tabular">{formatMoney(p.montantExact ?? p.montant, p.devise)}</span>
                    {p.trancheNumero && <span className="ml-2 text-caption font-normal text-navy-400">Tranche {p.trancheNumero}</span>}
                  </p>
                  <p className="text-caption text-navy-400">
                    {p.natureOperation} · {p.banque} · {formatDate(p.dateOperation)}
                    {p.reference && ` · réf. ${p.reference}`}
                    {p.dateReception && ` · reçu le ${formatDate(p.dateReception)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {p.preuveUrl && (
                    <a href={p.preuveUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                      <Paperclip className="h-3.5 w-3.5" /> Preuve
                    </a>
                  )}
                  {p.recuPdfUrl && (
                    <a href={p.recuPdfUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                      <FileDown className="h-3.5 w-3.5" /> Reçu
                    </a>
                  )}
                  <Badge tone="success" dot>
                    Validé
                  </Badge>
                </div>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {dossier.syndics.length > 0 && (
        <Section title="Syndic" count={dossier.syndics.length} testId="section-syndic">
          <Card className="divide-y divide-navy-50">
            {dossier.syndics.map((s) => {
              const st = SYNDIC_STATUT[s.statut];
              return (
                <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" data-testid="syndic-ligne" data-statut={s.statut}>
                  <div>
                    <p className="font-medium text-navy-900">
                      <Building className="mr-1.5 inline h-4 w-4 text-gold-600" />
                      Syndic {s.periode ?? ""}
                    </p>
                    <p className="text-caption text-navy-400">
                      {s.natureOperation ? `${s.natureOperation} · ${s.banque} · ${formatDate(s.dateOperation)} · porteur ${s.porteur}` : "Paiement attendu du client."}
                    </p>
                    {s.preuveUrl && (
                      <a href={s.preuveUrl} target="_blank" rel="noreferrer" className={`${lienDoc} mt-1`}>
                        <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right">
                    <p className="text-price tabular text-navy-900">{formatMoney(s.montant)}</p>
                    <StatusBadge statut={s.statut} label={st?.label ?? s.statut} tone={st?.tone ?? "neutral"} />
                    {isComptable && s.statut === "EN_ATTENTE_VALIDATION" && <ValiderSyndicButton syndicId={s.id} />}
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>
      )}

      {detenu && isCommercialDuBien && (
        <Section title="Saisir un encaissement" testId="section-saisie-paiement">
          <Card className="p-5">
            <p className="mb-5 text-caption text-navy-400">
              Première tranche (avance) ou tranche suivante réglée auprès de vous. Le Comptable Interne complétera la référence et
              validera l&apos;opération.
            </p>
            <PaiementForm action={saisirPaiementCommercial} bienId={bien.id} echeances={dossier.echeancier} />
          </Card>
        </Section>
      )}
    </div>
  );
}
