import type { biens, clients, echeances, paiements, projets, promoteurs } from "@/db/schema";
import { PdfWriter, fmtDate, fmtMoney, COLORS } from "./common";
import { saveUpload } from "@/lib/storage";

type Bien = typeof biens.$inferSelect;
type Client = typeof clients.$inferSelect;
type Echeance = typeof echeances.$inferSelect;
type Paiement = typeof paiements.$inferSelect;
type Projet = typeof projets.$inferSelect;
type Promoteur = typeof promoteurs.$inferSelect;

export type ContratContext = {
  projet?: Projet | null;
  promoteur?: Promoteur | null;
  /** Paiements validés par le Comptable Interne (référence, montant exact, date de réception, porteur) — section 9.1 */
  paiements?: Paiement[];
  reference?: string;
};

const ECH_LABEL: Record<string, string> = { EN_ATTENTE: "En attente", PARTIELLE: "Partielle", PAYEE: "Payée" };

/**
 * Génère le contrat de vente (section 7.2 du cahier des charges) et retourne
 * le PDF sous forme de Buffer.
 */
export async function genererContratPdf(
  bien: Bien,
  client: Client,
  echeancier: Echeance[],
  ctx: ContratContext = {},
): Promise<Buffer> {
  const promoteurNom = ctx.promoteur?.nom ?? "Promoteur";
  const pdf = await PdfWriter.create("Contrat de vente", promoteurNom);
  const ref = ctx.reference ?? bien.id.slice(0, 8).toUpperCase();

  pdf.title("Contrat de vente");
  pdf.text(`Référence ${ref} · établi le ${fmtDate(new Date())}`, { size: 9, color: COLORS.grey });

  pdf.section("Le vendeur");
  pdf.fields([
    ["Promoteur", promoteurNom],
    ["Projet", ctx.projet?.nom],
    ["Compte / société", ctx.projet?.nomCompte],
    ["IBAN", ctx.projet?.iban],
  ]);

  pdf.section("L'acquéreur");
  const naissance = [client.dateNaissance ? fmtDate(client.dateNaissance) : null, client.lieuNaissance]
    .filter(Boolean)
    .join(" à ");
  pdf.fields([
    ["Nom et prénom", `${client.nom.toUpperCase()} ${client.prenom}`],
    ["Né(e) le / à", naissance],
    ["Adresse", client.adresse],
    [`${client.pieceType === "PASSEPORT" ? "Passeport" : "CIN"} n°`, client.pieceNumero],
    ["Téléphone", [client.telephone1, client.telephone2].filter(Boolean).join(" / ")],
    ["E-mail", client.email],
  ]);

  pdf.section("Le bien");
  pdf.fields([
    ["Désignation", bien.designation],
    ["Nature", bien.nature],
    ["Surface", `${bien.surface} m²`],
    ["Prix de vente", fmtMoney(bien.prix)],
  ]);

  pdf.section("Échéancier de paiement");
  const sorted = [...echeancier].sort((a, b) => a.numero - b.numero);
  if (sorted.length === 0) {
    pdf.text("Aucun échéancier n'a été enregistré pour ce bien.", { size: 9.5, color: COLORS.grey });
  } else {
    pdf.table(
      ["Tranche", "Pourcentage", "Montant", "Date d'échéance", "Statut"],
      sorted.map((e) => [
        `Tranche ${e.numero}`,
        `${e.pourcentage} %`,
        fmtMoney(e.montant),
        fmtDate(e.dateEcheance),
        ECH_LABEL[e.statut] ?? e.statut,
      ]),
      [1, 1, 1.4, 1.4, 1],
      { alignRight: [1, 2] },
    );
    const total = sorted.reduce((s, e) => s + e.montant, 0);
    const pct = sorted.reduce((s, e) => s + e.pourcentage, 0);
    pdf.text(`Total : ${fmtMoney(total)} (${pct} % du prix)`, { size: 9, bold: true, align: "right" });
  }

  const valides = (ctx.paiements ?? []).filter((p) => p.statut === "VALIDE");
  if (valides.length > 0) {
    pdf.section("Paiements enregistrés (références comptables)");
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

  pdf.section("Conditions");
  pdf.text(
    "L'acquéreur s'engage à régler le prix de vente selon l'échéancier ci-dessus. " +
      "Toute somme perçue en trop sur une tranche est automatiquement déduite du paiement suivant. " +
      "Le présent contrat doit être imprimé et légalisé en quatre (4) exemplaires ; trois exemplaires sont " +
      "restitués à l'acquéreur, le quatrième, signé et cacheté, est conservé par le promoteur et rendu " +
      "disponible dans l'espace client sous forme numérisée.",
    { size: 9.5 },
  );

  pdf.signatures("Le vendeur", "L'acquéreur", 'Précédé de la mention "Lu et approuvé"');
  pdf.text(`Fait à ______________________, le ____ / ____ / ________`, { size: 9, color: COLORS.grey });

  return pdf.toBuffer();
}

/** Génère puis enregistre le contrat dans storage/uploads/contrats/ ; retourne son chemin public. */
export async function genererEtStockerContrat(
  bien: Bien,
  client: Client,
  echeancier: Echeance[],
  ctx: ContratContext = {},
) {
  const buffer = await genererContratPdf(bien, client, echeancier, ctx);
  return saveUpload("contrats", "contrat.pdf", buffer);
}
