import type { biens, clients, echeances, projets, promoteurs } from "@/db/schema";
import { fmtDate, fmtMoney } from "@/lib/pdf/common";
import type { ValeursContrat } from "@/lib/contrats-sections";

const ECH_LABEL: Record<string, string> = { EN_ATTENTE: "En attente", PARTIELLE: "Partielle", PAYEE: "Payée" };

/**
 * Valeurs des jetons de fusion d'un contrat, calculées à partir des données du
 * dossier (sans base de données : utilisable par le générateur PDF, le seed et
 * les tests). Côté serveur uniquement (formats du moteur PDF).
 */
export function valeursDepuisDonnees(d: {
  bien: typeof biens.$inferSelect;
  client: typeof clients.$inferSelect;
  projet: typeof projets.$inferSelect | null;
  promoteur: typeof promoteurs.$inferSelect;
  echeancier: (typeof echeances.$inferSelect)[];
  reference: string;
}): ValeursContrat {
  const { bien, client, projet, promoteur, echeancier } = d;
  const contact = [promoteur.contactEmail, promoteur.contactTelephone].filter(Boolean).join(", ");
  const naissance = [client.dateNaissance ? fmtDate(client.dateNaissance) : null, client.lieuNaissance].filter(Boolean).join(" à ");
  const tranches = [...echeancier].sort((a, b) => a.numero - b.numero);
  return {
    promoteur: promoteur.nom,
    "promoteur.contact": contact ? ` (${contact})` : "",
    client: `${client.nom.toUpperCase()} ${client.prenom}`,
    "client.piece": `${client.pieceType === "PASSEPORT" ? "passeport" : "CIN"} n° ${client.pieceNumero ?? "—"}`,
    "client.naissance": naissance,
    "client.adresse": client.adresse ?? "",
    "client.telephone": [client.telephone1, client.telephone2].filter(Boolean).join(" / "),
    "client.email": client.email ?? "",
    projet: projet?.nom ?? "",
    "projet.compte": projet?.nomCompte ?? "",
    "projet.iban": projet?.iban ?? "",
    bien: bien.designation,
    "bien.nature": bien.nature,
    "bien.surface": String(bien.surface),
    prix: fmtMoney(bien.prix),
    echeancier: tranches.length
      ? tranches.map((e) => `Tranche ${e.numero} · ${e.pourcentage} % · ${fmtMoney(e.montant)} · ${fmtDate(e.dateEcheance)} · ${ECH_LABEL[e.statut] ?? e.statut}`).join("\n")
      : "Aucun échéancier enregistré.",
    reference: d.reference,
    date: fmtDate(new Date()),
  };
}
