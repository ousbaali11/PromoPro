import { eq } from "drizzle-orm";
import { FileCheck2, FileDown, FileSignature, History, Landmark } from "lucide-react";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { SessionPayload } from "@/lib/auth";
import { Badge, Callout, Card, EmptyState, Info, Section, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { BienDuClient, Client, DossierBien } from "@/lib/dossier-client";
import { DesistementCarte, lienDoc } from "@/components/dossier/cartes";
import { CopieSigneeForm } from "@/app/dashboard/contrats/CopieSigneeForm";
import { NotaireButton } from "@/app/dashboard/contrats/NotaireButton";
import { VerifierButton, RembourserForm } from "@/app/dashboard/desistements/DesistementActions";
import { lireHistoriquePdf } from "@/lib/contrats-sections";
import { contexteContrat, sectionsDuContrat } from "@/lib/contrats";
import { LinkButton } from "@/components/ui/Button";
import { Settings2 } from "lucide-react";
import { CreerContratButton, EditeurContrat, RestaurerContratButton } from "./EditeurContrat";
import { creerContrat } from "./contrat-actions";

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

/**
 * Onglet Contrat : contrat actif du bien pour ce client (état, PDF courant et
 * versions archivées, copie signée), éditeur par sections pour le Responsable
 * Administratif, contrats supprimés consultables, dossier notaire, désistement.
 */
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
  const detenu = bien.clientId === client.id && ["VENDU", "LIVRE"].includes(bien.statut);
  const commercialDesistement = dossier.desistement?.commercialId
    ? await db.query.users.findFirst({ where: eq(users.id, dossier.desistement.commercialId) })
    : null;

  // Éditeur : sections créées au premier accès, déjà remplies avec les données du dossier (texte simple)
  let sectionsEditeur: Awaited<ReturnType<typeof sectionsDuContrat>> | null = null;
  if (contrat && isRespAdm && contrat.statut !== "ANNULE") {
    sectionsEditeur = await sectionsDuContrat(contrat, await contexteContrat(contrat));
  }
  const historique = contrat ? lireHistoriquePdf(contrat.historiquePdf) : [];

  return (
    <div className="space-y-6">
      <Section title="Contrat de vente" testId="section-contrat">
        {!contrat ? (
          <Card className="space-y-4 p-5" data-testid="carte-sans-contrat">
            <EmptyState
              icon={<FileSignature />}
              title="Aucun contrat actif"
              description={
                detenu
                  ? dossier.contratsSupprimes.length
                    ? "Le contrat précédent a été supprimé ; il reste consultable ci-dessous. Vous pouvez en créer un nouveau."
                    : "Le contrat apparaît dès que le PDG accepte la proposition de vente."
                  : "Ce client n'a pas de contrat sur ce bien."
              }
              className="py-6"
            />
            {isRespAdm && detenu && <CreerContratButton bienId={bien.id} clientId={client.id} creer={creerContrat} />}
          </Card>
        ) : (
          <Card className="space-y-4 p-5" data-testid="carte-contrat" data-statut={contrat.statut}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Info label="Créé le" value={formatDate(contrat.createdAt)} />
                <Info label="Confirmé le" value={contrat.confirmedAt ? formatDate(contrat.confirmedAt) : undefined} />
                <Info label="PDF généré le" value={contrat.pdfGenereAt ? formatDateTime(contrat.pdfGenereAt) : contrat.confirmedAt ? formatDate(contrat.confirmedAt) : undefined} />
              </div>
              <StatusBadge statut={contrat.statut} label={CONTRAT_LABELS[contrat.statut]} tone={CONTRAT_TONES[contrat.statut]} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-caption">
              {contrat.pdfUrl && (
                <a href={contrat.pdfUrl} target="_blank" rel="noreferrer" className={lienDoc} data-testid="lien-contrat-pdf">
                  <FileDown className="h-3.5 w-3.5" /> Contrat PDF
                </a>
              )}
              {contrat.copieSigneeUrl && (
                <a href={contrat.copieSigneeUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                  <FileCheck2 className="h-3.5 w-3.5" /> Copie signée
                </a>
              )}
              {!contrat.pdfUrl && contrat.statut === "EN_ATTENTE" && (
                <span className="text-navy-400">Aucun PDF pour l&apos;instant : complétez les sections puis générez-le.</span>
              )}
            </div>
            {historique.length > 0 && (
              <div className="rounded-md bg-navy-50 p-3 text-caption" data-testid="historique-pdf">
                <p className="mb-1 font-medium text-navy-900">
                  <History className="mr-1 inline h-3.5 w-3.5" /> Versions précédentes du PDF ({historique.length})
                </p>
                <ul className="space-y-1">
                  {historique.map((v, i) => (
                    <li key={`${v.url}-${i}`} className="flex flex-wrap items-center gap-2" data-testid="version-pdf">
                      <span className="text-navy-400">Version {historique.length - i} · générée le {formatDateTime(new Date(v.dateGeneration))}</span>
                      <a href={v.url} target="_blank" rel="noreferrer" className={lienDoc}>
                        <FileDown className="h-3.5 w-3.5" /> Ouvrir
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isRespAdm && ["PRET", "ENVOYE"].includes(contrat.statut) && (
              <div className="flex flex-wrap items-center gap-3 border-t border-navy-50 pt-4">
                <CopieSigneeForm contratId={contrat.id} />
              </div>
            )}
            {contrat.statut === "ANNULE" && (
              <Callout tone="neutral">Contrat annulé par le désistement du client : il n&apos;est plus modifiable.</Callout>
            )}
          </Card>
        )}
      </Section>

      {contrat && sectionsEditeur && (
        <Section
          title="Sections du contrat"
          count={sectionsEditeur.length}
          description="Texte déjà rempli avec les données du dossier : modifiez-le librement, réordonnez, supprimez ou ajoutez des sections, puis générez le PDF. Un contrat déjà confirmé reste modifiable : chaque génération archive la version précédente."
          action={
            <LinkButton href="/dashboard/contrats/modele" variant="ghost" size="sm" data-testid="lien-modele-defaut">
              <Settings2 className="h-4 w-4" /> Gérer le modèle par défaut
            </LinkButton>
          }
          testId="section-editeur-contrat"
        >
          <Card className="p-5">
            <EditeurContrat contratId={contrat.id} sections={sectionsEditeur} statut={contrat.statut} />
          </Card>
        </Section>
      )}

      {dossier.contratsSupprimes.length > 0 && (
        <Section title="Contrats supprimés" count={dossier.contratsSupprimes.length} testId="section-contrats-supprimes">
          <Card className="divide-y divide-navy-50">
            {dossier.contratsSupprimes.map((c) => {
              const versions = lireHistoriquePdf(c.historiquePdf);
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small" data-testid="contrat-supprime">
                  <div>
                    <p className="font-medium text-navy-900">
                      Contrat créé le {formatDate(c.createdAt)} · supprimé le {formatDate(c.deletedAt)}
                    </p>
                    <p className="text-caption text-navy-400">
                      Statut au moment de la suppression : {CONTRAT_LABELS[c.statut] ?? c.statut}
                      {versions.length > 0 && ` · ${versions.length} version(s) archivée(s)`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {c.pdfUrl && (
                      <a href={c.pdfUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                        <FileDown className="h-3.5 w-3.5" /> Dernier PDF
                      </a>
                    )}
                    {versions.map((v, i) => (
                      <a key={v.url} href={v.url} target="_blank" rel="noreferrer" className={lienDoc}>
                        <FileDown className="h-3.5 w-3.5" /> Version {versions.length - i}
                      </a>
                    ))}
                    {c.copieSigneeUrl && (
                      <a href={c.copieSigneeUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                        <FileCheck2 className="h-3.5 w-3.5" /> Copie signée
                      </a>
                    )}
                    {isRespAdm && !contrat && detenu && <RestaurerContratButton contratId={c.id} />}
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>
      )}

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
