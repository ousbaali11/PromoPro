import { eq } from "drizzle-orm";
import { FileCheck2, FileDown, FileSignature, Landmark } from "lucide-react";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { SessionPayload } from "@/lib/auth";
import { Badge, Card, EmptyState, Info, Section, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";
import type { BienDuClient, Client, DossierBien } from "@/lib/dossier-client";
import { DesistementCarte, lienDoc } from "@/components/dossier/cartes";
import { ConfirmerButton } from "@/app/dashboard/contrats/ConfirmerButton";
import { CopieSigneeForm } from "@/app/dashboard/contrats/CopieSigneeForm";
import { NotaireButton } from "@/app/dashboard/contrats/NotaireButton";
import { VerifierButton, RembourserForm } from "@/app/dashboard/desistements/DesistementActions";

export const CONTRAT_LABELS: Record<string, string> = {
  EN_ATTENTE: "En attente",
  PRET: "Prêt",
  ENVOYE: "Envoyé",
  SIGNE: "Signé",
  ANNULE: "Annulé (désistement)",
};
export const CONTRAT_TONES: Record<string, Tone> = {
  EN_ATTENTE: "warning",
  PRET: "info",
  ENVOYE: "navy",
  SIGNE: "success",
  ANNULE: "neutral",
};

/** Onglet Contrat : état du contrat du bien pour ce client, actions du Responsable Administratif, désistement éventuel. */
export async function OngletContrat({
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
  const isRespAdm = session.role === "RESPONSABLE_ADMINISTRATIF";
  const { bien } = selection;
  const contrat = dossier.contrat;
  const commercialDesistement = dossier.desistement?.commercialId
    ? await db.query.users.findFirst({ where: eq(users.id, dossier.desistement.commercialId) })
    : null;

  return (
    <div className="space-y-6">
      <Section title="Contrat de vente" testId="section-contrat">
        {!contrat ? (
          <EmptyState
            icon={<FileSignature />}
            title="Aucun contrat"
            description={
              bien.clientId === client.id
                ? "Le contrat apparaît dès que le PDG accepte la proposition de vente."
                : "Ce client n'a pas de contrat sur ce bien."
            }
          />
        ) : (
          <Card className="space-y-4 p-5" data-testid="carte-contrat" data-statut={contrat.statut}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Info label="Créé le" value={formatDate(contrat.createdAt)} />
                <Info label="Confirmé le" value={contrat.confirmedAt ? formatDate(contrat.confirmedAt) : undefined} />
              </div>
              <StatusBadge statut={contrat.statut} label={CONTRAT_LABELS[contrat.statut]} tone={CONTRAT_TONES[contrat.statut]} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-caption">
              {contrat.pdfUrl && (
                <a href={contrat.pdfUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                  <FileDown className="h-3.5 w-3.5" /> Contrat PDF
                </a>
              )}
              {contrat.copieSigneeUrl && (
                <a href={contrat.copieSigneeUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                  <FileCheck2 className="h-3.5 w-3.5" /> Copie signée
                </a>
              )}
              {!contrat.pdfUrl && contrat.statut === "EN_ATTENTE" && <span className="text-navy-400">PDF généré à la confirmation.</span>}
            </div>
            {isRespAdm && (contrat.statut === "EN_ATTENTE" || ["PRET", "ENVOYE"].includes(contrat.statut)) && (
              <div className="flex flex-wrap items-center gap-3 border-t border-navy-50 pt-4">
                {contrat.statut === "EN_ATTENTE" && <ConfirmerButton contratId={contrat.id} />}
                {["PRET", "ENVOYE"].includes(contrat.statut) && <CopieSigneeForm contratId={contrat.id} />}
              </div>
            )}
          </Card>
        )}
      </Section>

      {bien.statut === "LIVRE" && bien.clientId === client.id && (
        <Section title="Dossier notaire" testId="section-notaire">
          <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" data-testid="carte-notaire">
            <p className="text-small text-navy-900">
              <Landmark className="mr-1.5 inline h-4 w-4 text-gold-600" />
              Bien livré le {formatDate(bien.livreAt)} : dossier à transmettre au notaire.
            </p>
            {bien.notaireTransmisAt ? (
              <Badge tone="success" dot>
                Transmis au notaire le {formatDate(bien.notaireTransmisAt)}
              </Badge>
            ) : isRespAdm ? (
              <NotaireButton bienId={bien.id} />
            ) : (
              <Badge tone="warning" dot>
                À transmettre
              </Badge>
            )}
          </Card>
        </Section>
      )}

      {dossier.desistement && (
        <Section title="Désistement" testId="section-desistement">
          <DesistementCarte
            desistement={dossier.desistement}
            bien={bien}
            client={client}
            commercial={commercialDesistement}
            avecLiens={false}
            actions={
              isRespAdm ? (
                dossier.desistement.statut === "EN_ATTENTE" ? (
                  <VerifierButton desistementId={dossier.desistement.id} />
                ) : dossier.desistement.statut === "VERIFIE" ? (
                  <RembourserForm desistementId={dossier.desistement.id} />
                ) : undefined
              ) : undefined
            }
          />
        </Section>
      )}
    </div>
  );
}
