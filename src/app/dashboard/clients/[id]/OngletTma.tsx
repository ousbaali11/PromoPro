import { Hammer } from "lucide-react";
import type { SessionPayload } from "@/lib/auth";
import { Card, EmptyState, Section } from "@/components/ui/Primitives";
import type { BienDuClient, Client, DossierBien } from "@/lib/dossier-client";
import { TmaCarte } from "@/components/dossier/cartes";
import { ChiffrageTma, AvancementTma } from "@/app/dashboard/sav/TmaActions";

/** Onglet Travaux modificatifs : demandes du client sur ce bien, chiffrage / refus / avancement par le SAV. */
export function OngletTma({
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
  const isSav = session.role === "SERVICE_APRES_VENTE";
  const aChiffrer = dossier.tma.filter((d) => d.statut === "DEMANDE").length;
  return (
    <Section
      title="Travaux modificatifs acquéreurs"
      count={aChiffrer || undefined}
      countTone="warning"
      description="Demandes de modification du client sur ce bien : chiffrage et devis, puis suivi des travaux après acceptation."
      testId="section-tma"
    >
      {dossier.tma.length === 0 ? (
        <Card>
          <EmptyState icon={<Hammer />} title="Aucune demande de modification" description="Le client peut en déposer depuis son espace, dans le délai fixé par projet." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {dossier.tma.map((d) => (
            <TmaCarte
              key={d.id}
              demande={d}
              bien={selection.bien}
              client={client}
              avecLiens={false}
              actions={
                isSav ? (
                  d.statut === "DEMANDE" ? (
                    <ChiffrageTma demandeId={d.id} />
                  ) : d.statut === "SIGNE" || d.statut === "EN_COURS" ? (
                    <AvancementTma demandeId={d.id} statut={d.statut} />
                  ) : undefined
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </Section>
  );
}
