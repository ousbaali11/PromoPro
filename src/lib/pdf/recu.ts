import type { biens, clients, echeances, paiements, projets, promoteurs } from "@/db/schema";
import { PdfWriter, fmtDate, fmtMoney, COLORS } from "./common";
import { saveUpload } from "@/lib/storage";

type Bien = typeof biens.$inferSelect;
type Client = typeof clients.$inferSelect;
type Paiement = typeof paiements.$inferSelect;
type Echeance = typeof echeances.$inferSelect;
type Projet = typeof projets.$inferSelect;
type Promoteur = typeof promoteurs.$inferSelect;

export type RecuContext = {
  projet?: Projet | null;
  promoteur?: Promoteur | null;
  echeance?: Echeance | null;
  /** Nom du comptable ayant validé */
  validePar?: string;
};

/** Numéro de reçu lisible, dérivé de l'id du paiement : RECU-2026-A1B2C3D4 */
export function numeroRecu(paiement: Paiement) {
  const year = new Date(paiement.dateReception ?? paiement.createdAt ?? Date.now()).getFullYear();
  return `RECU-${year}-${paiement.id.slice(0, 8).toUpperCase()}`;
}

/**
 * Génère le reçu de paiement (section 9.2 du cahier des charges) — une page.
 */
export async function genererRecuPdf(
  paiement: Paiement,
  bien: Bien,
  client: Client,
  ctx: RecuContext = {},
): Promise<Buffer> {
  const promoteurNom = ctx.promoteur?.nom ?? "Promoteur";
  const pdf = await PdfWriter.create("Reçu de paiement", promoteurNom);
  const montant = paiement.montantExact ?? paiement.montant;
  const numero = numeroRecu(paiement);

  pdf.title("Reçu de paiement");
  pdf.text(`N° ${numero} · émis le ${fmtDate(new Date())}`, { size: 9, color: COLORS.grey });

  pdf.section("Reçu de");
  pdf.fields([
    ["Client", `${client.nom.toUpperCase()} ${client.prenom}`],
    [`${client.pieceType === "PASSEPORT" ? "Passeport" : "CIN"} n°`, client.pieceNumero],
    ["Porteur de l'opération", paiement.porteur],
    ["Téléphone", client.telephone1],
  ]);

  pdf.section("Montant");
  pdf.gap(2);
  pdf.text(fmtMoney(montant, paiement.devise), { size: 22, bold: true, color: COLORS.navy });
  pdf.gap(4);
  const tranche = paiement.trancheNumero ?? ctx.echeance?.numero;
  const pct = ctx.echeance?.pourcentage;
  pdf.fields([
    ["Tranche concernée", tranche ? `Tranche ${tranche}${pct ? ` (${pct} %)` : ""}` : "—"],
    ["Montant de la tranche", ctx.echeance ? fmtMoney(ctx.echeance.montant) : null],
    ["Bien", `${bien.designation} · ${bien.nature}`],
    ["Projet", ctx.projet?.nom],
  ]);

  pdf.section("Opération");
  pdf.fields([
    ["Nature de l'opération", paiement.natureOperation],
    ["Banque", paiement.banque],
    ["Référence de l'opération", paiement.reference],
    ["Date de l'opération", fmtDate(paiement.dateOperation)],
    ["Date de réception effective", fmtDate(paiement.dateReception)],
    paiement.natureOperation === "cheque"
      ? ["Date d'encaissement du chèque", fmtDate(paiement.dateEncaissementCheque)]
      : ["Montant déclaré", fmtMoney(paiement.montant, paiement.devise)],
  ]);

  pdf.gap(10);
  pdf.text(
    "Le présent reçu atteste de la réception du montant indiqué ci-dessus, vérifié et validé par le service " +
      "comptable du promoteur. Il est établi en un exemplaire numérique disponible dans l'espace client.",
    { size: 9, color: COLORS.grey },
  );

  pdf.signatures("Le Comptable Interne", "Cachet du promoteur", ctx.validePar ? `Validé par ${ctx.validePar}` : undefined);

  return pdf.toBuffer();
}

/** Génère puis enregistre le reçu dans storage/uploads/recus/ ; retourne son chemin public. */
export async function genererEtStockerRecu(paiement: Paiement, bien: Bien, client: Client, ctx: RecuContext = {}) {
  const buffer = await genererRecuPdf(paiement, bien, client, ctx);
  return saveUpload("recus", "recu.pdf", buffer);
}
