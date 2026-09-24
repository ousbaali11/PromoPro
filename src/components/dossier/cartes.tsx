import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, FileDown, Paperclip } from "lucide-react";
import type { biens, clients, demandesTma, desistements, paiements, users } from "@/db/schema";
import { Badge, Callout, Card, type Tone } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LinkButton } from "@/components/ui/Button";
import { NomCompte } from "@/components/ui/EtatCompte";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { TMA_LABELS, TMA_TONES, type StatutTma } from "@/lib/tma";

/*
 * Cartes d'un dossier (paiement en attente, désistement, demande de travaux
 * modificatifs), partagées entre les pages d'index (Paiements, Désistements,
 * SAV) et la fiche client. Sur un index, la carte porte un lien vers la fiche
 * (`lienFiche`) et aucune action ; sur la fiche, elle reçoit les actions du
 * rôle (`actions`). Une action ne s'exerce donc jamais depuis une liste plate.
 */

export const lienDoc =
  "inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus";
const lienTitre = "rounded-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus";

type Bien = typeof biens.$inferSelect;
type Client = typeof clients.$inferSelect;
type Compte = typeof users.$inferSelect;

/** Bouton « Traiter dans la fiche client » des pages d'index. */
export function LienFiche({ href, libelle = "Traiter dans la fiche client" }: { href: string; libelle?: string }) {
  return (
    <LinkButton href={href} size="sm" variant="secondary" data-testid="lien-fiche-client">
      {libelle} <ArrowRight className="h-4 w-4" />
    </LinkButton>
  );
}

export function PaiementAttenteCarte({
  paiement: p,
  bien,
  client,
  auteur,
  lienFiche,
  actions,
  avecLiens = true,
}: {
  paiement: typeof paiements.$inferSelect;
  bien: Bien | undefined;
  client: Client | undefined;
  auteur: ReactNode;
  lienFiche?: string;
  actions?: ReactNode;
  /** Sur la fiche, le bien et le client sont déjà connus : pas de lien vers leurs pages. */
  avecLiens?: boolean;
}) {
  return (
    <Card accent="warning" className="p-5" data-testid="paiement-attente">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-h3 text-navy-900">
            {bien && avecLiens ? (
              <Link href={`/dashboard/biens/${bien.id}`} className={lienTitre}>
                {bien.designation}
              </Link>
            ) : (
              bien?.designation ?? "—"
            )}
            {p.trancheNumero && (
              <Badge tone="neutral" className="ml-2 align-middle">
                Tranche {p.trancheNumero}
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-small text-navy-400">
            <NomCompte compte={client} /> · saisi par {auteur} le {formatDate(p.createdAt)}
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
          <a href={p.preuveUrl} target="_blank" rel="noreferrer" className={lienDoc}>
            <Paperclip className="h-3.5 w-3.5" /> Preuve de paiement
          </a>
        )}
        {p.porteurPieceUrl && (
          <a href={p.porteurPieceUrl} target="_blank" rel="noreferrer" className={lienDoc}>
            <Paperclip className="h-3.5 w-3.5" /> Pièce du porteur
          </a>
        )}
      </div>
      {actions && <div className="mt-4">{actions}</div>}
      {lienFiche && (
        <div className="mt-4 flex justify-end">
          <LienFiche href={lienFiche} />
        </div>
      )}
    </Card>
  );
}

const DESISTEMENT_LABELS: Record<string, string> = { EN_ATTENTE: "À vérifier", VERIFIE: "Vérifié — remboursement en cours", REMBOURSE: "Remboursé" };
const DESISTEMENT_TONES: Record<string, Tone> = { EN_ATTENTE: "warning", VERIFIE: "info", REMBOURSE: "success" };
const DESISTEMENT_ACCENTS: Record<string, Tone | undefined> = { EN_ATTENTE: "warning", VERIFIE: "info", REMBOURSE: undefined };

export function DesistementCarte({
  desistement: d,
  bien,
  client,
  commercial,
  lienFiche,
  actions,
  avecLiens = true,
}: {
  desistement: typeof desistements.$inferSelect;
  bien: Bien | undefined;
  client: Client | undefined;
  commercial: Compte | null | undefined;
  lienFiche?: string;
  actions?: ReactNode;
  avecLiens?: boolean;
}) {
  return (
    <Card accent={DESISTEMENT_ACCENTS[d.statut]} className="p-5" data-testid="desistement-carte" data-statut={d.statut}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-h3 text-navy-900">
            {bien && avecLiens ? (
              <Link href={`/dashboard/biens/${bien.id}`} className={lienTitre}>
                {bien.designation}
              </Link>
            ) : (
              bien?.designation ?? "—"
            )}
          </p>
          <p className="mt-0.5 text-small text-navy-400">
            {client && avecLiens ? (
              <Link href={`/dashboard/clients/${client.id}`} className={`${lienTitre} font-medium text-navy-900`}>
                <NomCompte compte={client} />
              </Link>
            ) : (
              <NomCompte compte={client} />
            )}
            {client?.pieceNumero && ` · ${client.pieceType ?? "CIN"} ${client.pieceNumero}`}
            {commercial && (
              <>
                {" · enregistré par "}
                <NomCompte compte={commercial} />
              </>
            )}
            {" · "}
            {formatDate(d.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge statut={d.statut} label={DESISTEMENT_LABELS[d.statut]} tone={DESISTEMENT_TONES[d.statut]} />
          <p className="text-caption text-navy-400">
            À rembourser : <span className="text-small font-semibold tabular text-navy-900">{formatMoney(d.montantARembourser)}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-caption">
        {d.documentUrl ? (
          <a href={d.documentUrl} target="_blank" rel="noreferrer" className={lienDoc}>
            <Paperclip className="h-3.5 w-3.5" /> Document de désistement légalisé
          </a>
        ) : (
          <span className="font-medium text-danger-fg">Document manquant</span>
        )}
        {client?.pieceDocUrl && (
          <a href={client.pieceDocUrl} target="_blank" rel="noreferrer" className={lienDoc}>
            <Paperclip className="h-3.5 w-3.5" /> Pièce d&apos;identité du client
          </a>
        )}
        {d.verifiedAt && <span className="text-navy-400">Vérifié le {formatDate(d.verifiedAt)}</span>}
        {d.rembourseAt && <span className="text-navy-400">Remboursé le {formatDate(d.rembourseAt)}</span>}
        {d.dechargeNote && <span className="text-navy-400">Décharge : {d.dechargeNote}</span>}
      </div>
      {actions && d.statut === "EN_ATTENTE" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-navy-50 pt-4">
          {actions}
          <Callout tone="neutral" className="flex-1 py-1.5">
            Si le payeur diffère du client, exiger une décharge signée avant remboursement.
          </Callout>
        </div>
      )}
      {actions && d.statut === "VERIFIE" && <div className="mt-4 border-t border-navy-50 pt-4">{actions}</div>}
      {lienFiche && d.statut !== "REMBOURSE" && (
        <div className="mt-4 flex justify-end">
          <LienFiche href={lienFiche} />
        </div>
      )}
    </Card>
  );
}

export function TmaCarte({
  demande: d,
  bien,
  client,
  lienFiche,
  actions,
  avecLiens = true,
}: {
  demande: typeof demandesTma.$inferSelect;
  bien: Bien | undefined;
  client: Client | undefined;
  lienFiche?: string;
  actions?: ReactNode;
  avecLiens?: boolean;
}) {
  const statut = d.statut as StatutTma;
  return (
    <Card className="space-y-3 p-5" data-testid="tma-carte" data-statut-tma={d.statut}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-navy-900">
            {bien && avecLiens ? (
              <Link href={`/dashboard/biens/${bien.id}`} className="hover:underline">
                {bien.designation}
              </Link>
            ) : (
              bien?.designation ?? "Bien inconnu"
            )}
            <span className="text-navy-400"> · </span>
            <span className="text-navy-400">
              <NomCompte compte={client} />
            </span>
          </p>
          <p className="mt-1 text-small text-navy-900">{d.description}</p>
          <p className="mt-1 text-caption text-navy-400">
            Demandée le {formatDate(d.dateDemande)}
            {d.dateLimite && ` · dépôt possible jusqu'au ${formatDate(d.dateLimite)}`}
            {d.signatureClientAt && ` · devis accepté le ${formatDateTime(d.signatureClientAt)}`}
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            {d.croquisUrl && (
              <a href={d.croquisUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                <Paperclip className="h-3.5 w-3.5" /> Pièce jointe du client
              </a>
            )}
            {d.devisUrl && (
              <a href={d.devisUrl} target="_blank" rel="noreferrer" className={lienDoc}>
                <FileDown className="h-3.5 w-3.5" /> Devis
              </a>
            )}
          </div>
          {d.motifRefus && <p className="mt-1 text-caption text-danger-fg">Refus : {d.motifRefus}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge statut={d.statut} label={TMA_LABELS[statut] ?? d.statut} tone={TMA_TONES[statut] ?? "neutral"} />
          {d.montant != null && <span className="text-small font-semibold tabular text-navy-900">{formatMoney(d.montant)}</span>}
        </div>
      </div>
      {actions}
      {lienFiche && ["DEMANDE", "SIGNE", "EN_COURS"].includes(d.statut) && (
        <div className="flex justify-end">
          <LienFiche href={lienFiche} />
        </div>
      )}
    </Card>
  );
}
