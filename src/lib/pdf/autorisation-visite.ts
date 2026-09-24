import type { biens, clients, projets, promoteurs, visites } from "@/db/schema";
import { PdfWriter, fmtDate, COLORS } from "./common";
import { enteteDuPromoteur } from "./entete";
import { saveUpload } from "@/lib/storage";
import { CRENEAUX_LIBELLE } from "@/lib/creneaux";

type Visite = typeof visites.$inferSelect;
type Bien = typeof biens.$inferSelect;
type Client = typeof clients.$inferSelect;

function fmtDateTime(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Document « Autorisation de visite » (section 11.7), une page. */
export async function genererAutorisationVisitePdf(
  visite: Visite,
  bien: Bien,
  client: Client,
  ctx: { projet?: typeof projets.$inferSelect | null; promoteur: typeof promoteurs.$inferSelect; savNom?: string },
): Promise<Buffer> {
  const promoteurNom = ctx.promoteur.nom;
  const pdf = await PdfWriter.create("Autorisation de visite", await enteteDuPromoteur(ctx.promoteur));

  pdf.title("Autorisation de visite");
  pdf.text(`N° ${visite.id.slice(0, 8).toUpperCase()} · délivrée le ${fmtDate(visite.decidedAt ?? new Date())}`, {
    size: 9,
    color: COLORS.grey,
  });

  pdf.section("Visiteur");
  pdf.fields([
    ["Client", `${client.nom.toUpperCase()} ${client.prenom}`],
    [`${client.pieceType === "PASSEPORT" ? "Passeport" : "CIN"} n°`, client.pieceNumero],
    ["Téléphone", client.telephone1],
    ["E-mail", client.email],
  ]);

  pdf.section("Bien à visiter");
  pdf.fields([
    ["Désignation", bien.designation],
    ["Nature", bien.nature],
    ["Projet", ctx.projet?.nom],
    ["Surface", `${bien.surface} m²`],
  ]);

  pdf.section("Créneau de visite");
  if (visite.dateVisite) {
    pdf.text(fmtDateTime(visite.dateVisite), { size: 13, bold: true, color: COLORS.navy });
  } else {
    pdf.text("À choisir par le client dans son espace, parmi les créneaux disponibles.", { size: 10 });
  }
  pdf.gap(4);
  pdf.text(`Créneaux autorisés : ${CRENEAUX_LIBELLE}.`, { size: 9, color: COLORS.grey });

  pdf.section("Conditions");
  pdf.text(
    `${promoteurNom} autorise le client désigné ci-dessus à accéder au chantier pour visiter le bien indiqué, ` +
      "accompagné d'un représentant du Service Après-Vente. Le port des équipements de sécurité fournis sur place " +
      "est obligatoire. Cette autorisation est personnelle et doit être présentée avec une pièce d'identité.",
    { size: 9.5 },
  );

  pdf.signatures("Le Service Après-Vente", "Le visiteur", ctx.savNom ? `Délivrée par ${ctx.savNom}` : undefined);
  return pdf.toBuffer();
}

export async function genererEtStockerAutorisationVisite(
  ...args: Parameters<typeof genererAutorisationVisitePdf>
) {
  const buffer = await genererAutorisationVisitePdf(...args);
  return saveUpload("autorisations-visite", "autorisation.pdf", buffer);
}
