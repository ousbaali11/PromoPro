import type { biens, clients, fraisDossier, projets, promoteurs } from "@/db/schema";
import { PdfWriter, fmtDate, fmtMoney, COLORS } from "./common";
import { enteteDuPromoteur } from "./entete";
import { saveUpload } from "@/lib/storage";

type Bien = typeof biens.$inferSelect;
type Client = typeof clients.$inferSelect;
type FraisDossier = typeof fraisDossier.$inferSelect;
type Projet = typeof projets.$inferSelect;
type Promoteur = typeof promoteurs.$inferSelect;

/** Numéro de reçu lisible, dérivé de l'id des frais : FRAIS-2026-A1B2C3D4 (même forme que les reçus de tranche). */
export function numeroRecuFraisDossier(frais: { id: string; validatedAt?: Date | null; createdAt?: Date | null }) {
  const year = new Date(frais.validatedAt ?? frais.createdAt ?? Date.now()).getFullYear();
  return `FRAIS-${year}-${frais.id.slice(0, 8).toUpperCase()}`;
}

/** Reçu de frais de dossier (une page), sur le modèle du reçu de paiement de tranche. */
export async function genererRecuFraisDossierPdf(frais: FraisDossier, bien: Bien, client: Client, ctx: { projet?: Projet | null; promoteur: Promoteur; validePar?: string }): Promise<Buffer> {
  const pdf = await PdfWriter.create("Reçu de frais de dossier", await enteteDuPromoteur(ctx.promoteur));
  const numero = numeroRecuFraisDossier(frais);

  pdf.title("Reçu de frais de dossier");
  pdf.text(`N° ${numero} · émis le ${fmtDate(new Date())}`, { size: 9, color: COLORS.grey });

  pdf.section("Reçu de");
  pdf.fields([
    ["Client", `${client.nom.toUpperCase()} ${client.prenom}`],
    [`${client.pieceType === "PASSEPORT" ? "Passeport" : "CIN"} n°`, client.pieceNumero],
    ["Porteur de l'opération", frais.porteur],
    ["Téléphone", client.telephone1],
  ]);

  pdf.section("Montant");
  pdf.gap(2);
  pdf.text(fmtMoney(frais.montant), { size: 22, bold: true, color: COLORS.navy });
  pdf.gap(4);
  pdf.fields([
    ["Objet", "Frais de dossier"],
    ["Bien", `${bien.designation} · ${bien.nature}`],
    ["Projet", ctx.projet?.nom],
  ]);

  pdf.section("Opération");
  pdf.fields([
    ["Nature de l'opération", frais.natureOperation],
    ["Banque", frais.banque],
    ["Date de l'opération", fmtDate(frais.dateOperation)],
    ["Date de validation", fmtDate(frais.validatedAt ?? new Date())],
  ]);

  pdf.gap(10);
  pdf.text(
    "Le présent reçu atteste de la réception des frais de dossier indiqués ci-dessus, vérifiés et validés par le service " +
      "comptable du promoteur. Il est établi en un exemplaire numérique disponible dans l'espace client.",
    { size: 9, color: COLORS.grey },
  );

  pdf.signatures("Le Comptable Interne", "Cachet du promoteur", ctx.validePar ? `Validé par ${ctx.validePar}` : undefined);

  return pdf.toBuffer();
}

/** Génère puis enregistre le reçu dans storage/uploads/recus/ ; retourne son chemin public. */
export async function genererEtStockerRecuFraisDossier(frais: FraisDossier, bien: Bien, client: Client, ctx: { projet?: Projet | null; promoteur: Promoteur; validePar?: string }) {
  const buffer = await genererRecuFraisDossierPdf(frais, bien, client, ctx);
  return saveUpload("recus", "recu-frais-dossier.pdf", buffer);
}
