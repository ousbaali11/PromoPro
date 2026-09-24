import type { biens, clients, echeances, paiements, projets, promoteurs } from "@/db/schema";
import { PdfWriter, fmtDate, fmtMoney, COLORS } from "./common";
import { enteteDuPromoteur } from "./entete";
import { saveUpload } from "@/lib/storage";
import { SECTIONS_PAR_DEFAUT, rendreSections, type SectionTexte } from "@/lib/contrats-sections";
import { valeursDepuisDonnees } from "@/lib/contrats-valeurs";

type Bien = typeof biens.$inferSelect;
type Client = typeof clients.$inferSelect;
type Echeance = typeof echeances.$inferSelect;
type Paiement = typeof paiements.$inferSelect;
type Projet = typeof projets.$inferSelect;
type Promoteur = typeof promoteurs.$inferSelect;

export type ContratContext = {
  projet?: Projet | null;
  /** Promoteur vendeur : son nom (et son logo) figurent en en-tête, en pied de page et dans les métadonnées. */
  promoteur: Promoteur;
  /** Paiements validés par le Comptable Interne (référence, montant exact, date de réception, porteur) — section 9.1 */
  paiements?: Paiement[];
  reference?: string;
  /**
   * Sections du contrat déjà fusionnées (titre + texte), dans l'ordre. Sans
   * cette liste, le jeu de sections par défaut est rendu avec les données du
   * dossier (seed, tests).
   */
  sections?: SectionTexte[];
};

/**
 * Génère le contrat de vente (section 7.2 du cahier des charges) : sections
 * éditées par le Responsable Administratif, puis annexe automatique des
 * paiements validés (références comptables, section 9.1) et cadres de
 * signature. Retourne le PDF sous forme de Buffer.
 */
export async function genererContratPdf(
  bien: Bien,
  client: Client,
  echeancier: Echeance[],
  ctx: ContratContext,
): Promise<Buffer> {
  const pdf = await PdfWriter.create("Contrat de vente", await enteteDuPromoteur(ctx.promoteur));
  const ref = ctx.reference ?? bien.id.slice(0, 8).toUpperCase();
  const sections =
    ctx.sections ??
    rendreSections(
      SECTIONS_PAR_DEFAUT,
      valeursDepuisDonnees({ bien, client, projet: ctx.projet ?? null, promoteur: ctx.promoteur, echeancier, reference: ref }),
    );

  pdf.title("Contrat de vente");
  pdf.text(`Référence ${ref} · établi le ${fmtDate(new Date())}`, { size: 9, color: COLORS.grey });

  for (const s of sections) {
    pdf.section(s.titre);
    pdf.text(s.contenu || "—", { size: 9.5 });
  }

  const valides = (ctx.paiements ?? []).filter((p) => p.statut === "VALIDE");
  if (valides.length > 0) {
    pdf.section("Annexe — paiements enregistrés (références comptables)");
    pdf.table(
      ["Tranche", "Nature", "Référence", "Montant reçu", "Date de réception", "Porteur"],
      valides.map((p) => [
        p.trancheNumero ? `Tranche ${p.trancheNumero}` : "—",
        p.natureOperation ?? "—",
        p.reference ?? "—",
        fmtMoney(p.montantExact ?? p.montant, p.devise),
        fmtDate(p.dateReception ?? p.dateOperation),
        p.porteur ?? "—",
      ]),
      [0.9, 1.2, 1.3, 1.2, 1.2, 1.3],
      { alignRight: [3] },
    );
  }

  pdf.signatures("Le vendeur", "L'acquéreur", 'Précédé de la mention "Lu et approuvé"');
  pdf.text(`Fait à ______________________, le ____ / ____ / ________`, { size: 9, color: COLORS.grey });

  return pdf.toBuffer();
}

/** Génère puis enregistre le contrat dans storage/uploads/contrats/ ; retourne son chemin public. */
export async function genererEtStockerContrat(bien: Bien, client: Client, echeancier: Echeance[], ctx: ContratContext) {
  const buffer = await genererContratPdf(bien, client, echeancier, ctx);
  return saveUpload("contrats", "contrat.pdf", buffer);
}
