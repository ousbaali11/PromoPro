import { FileCheck2, FileDown, FileText, Paperclip } from "lucide-react";
import { Card, EmptyState, Section } from "@/components/ui/Primitives";
import { formatDate, formatMoney } from "@/lib/utils";
import type { BienDuClient, Client, DossierBien } from "@/lib/dossier-client";
import { lienDoc } from "@/components/dossier/cartes";

type Document = { libelle: string; detail?: string; href: string; icone: typeof FileDown };

/** Onglet Documents : tout ce qui a été déposé ou généré pour ce client et ce bien, en lecture seule. */
export function OngletDocuments({ client, selection, dossier }: { client: Client; selection: BienDuClient; dossier: DossierBien }) {
  const groupes: { titre: string; documents: Document[] }[] = [
    {
      titre: "Identité",
      documents: client.pieceDocUrl ? [{ libelle: `Pièce d'identité (${client.pieceType ?? "CIN"} ${client.pieceNumero ?? ""})`.trim(), href: client.pieceDocUrl, icone: FileText }] : [],
    },
    {
      titre: "Contrat",
      documents: [
        ...(dossier.contrat?.pdfUrl ? [{ libelle: "Contrat de vente (PDF)", detail: dossier.contrat.confirmedAt ? `confirmé le ${formatDate(dossier.contrat.confirmedAt)}` : undefined, href: dossier.contrat.pdfUrl, icone: FileDown }] : []),
        ...(dossier.contrat?.copieSigneeUrl ? [{ libelle: "Copie signée et cachetée", href: dossier.contrat.copieSigneeUrl, icone: FileCheck2 }] : []),
      ],
    },
    {
      titre: "Paiements",
      documents: dossier.paiements.flatMap((p) => [
        ...(p.preuveUrl ? [{ libelle: `Preuve de paiement · ${formatMoney(p.montant, p.devise)}`, detail: `${p.natureOperation} · ${formatDate(p.dateOperation)}`, href: p.preuveUrl, icone: Paperclip }] : []),
        ...(p.porteurPieceUrl ? [{ libelle: "Pièce du porteur", detail: p.porteur ?? undefined, href: p.porteurPieceUrl, icone: Paperclip }] : []),
        ...(p.recuPdfUrl ? [{ libelle: `Reçu · ${formatMoney(p.montantExact ?? p.montant, p.devise)}`, detail: p.reference ? `réf. ${p.reference}` : undefined, href: p.recuPdfUrl, icone: FileDown }] : []),
      ]),
    },
    {
      titre: "Syndic",
      documents: dossier.syndics.flatMap((s) => (s.preuveUrl ? [{ libelle: `Preuve de paiement du syndic · ${formatMoney(s.montant)}`, detail: s.periode ?? undefined, href: s.preuveUrl, icone: Paperclip }] : [])),
    },
    {
      titre: "Visites",
      documents: dossier.visites.flatMap((v) => (v.autorisationUrl ? [{ libelle: "Autorisation de visite", detail: v.dateVisite ? `visite le ${formatDate(v.dateVisite)}` : `délivrée le ${formatDate(v.decidedAt)}`, href: v.autorisationUrl, icone: FileDown }] : [])),
    },
    {
      titre: "Travaux modificatifs",
      documents: dossier.tma.flatMap((d) => [
        ...(d.croquisUrl ? [{ libelle: "Pièce jointe du client", detail: d.description.slice(0, 60), href: d.croquisUrl, icone: Paperclip }] : []),
        ...(d.devisUrl ? [{ libelle: `Devis · ${d.montant != null ? formatMoney(d.montant) : ""}`.trim(), detail: d.description.slice(0, 60), href: d.devisUrl, icone: FileDown }] : []),
      ]),
    },
    {
      titre: "Désistement",
      documents: dossier.desistement?.documentUrl ? [{ libelle: "Document de désistement légalisé", detail: formatDate(dossier.desistement.createdAt), href: dossier.desistement.documentUrl, icone: Paperclip }] : [],
    },
  ].filter((g) => g.documents.length > 0);

  return (
    <Section title="Documents" description={`Tout ce qui concerne ${client.prenom} ${client.nom} et ${selection.bien.designation}.`} testId="section-documents">
      {groupes.length === 0 ? (
        <EmptyState icon={<FileText />} title="Aucun document" description="Pièces, contrats, reçus, autorisations et devis apparaîtront ici." />
      ) : (
        <div className="space-y-4">
          {groupes.map((g) => (
            <Card key={g.titre} className="divide-y divide-navy-50" data-testid="groupe-documents" data-groupe={g.titre}>
              <p className="px-5 py-2 text-label uppercase text-navy-400">{g.titre}</p>
              {g.documents.map((d, i) => (
                <div key={`${d.href}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small" data-testid="document-ligne">
                  <div>
                    <p className="font-medium text-navy-900">{d.libelle}</p>
                    {d.detail && <p className="text-caption text-navy-400">{d.detail}</p>}
                  </div>
                  <a href={d.href} target="_blank" rel="noreferrer" className={lienDoc}>
                    <d.icone className="h-3.5 w-3.5" /> Ouvrir
                  </a>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
