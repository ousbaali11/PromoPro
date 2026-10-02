/* Frais de dossier : statuts et libellés, partagés par le serveur, les composants client et les tests (aucun import Node). */

export const STATUTS_FRAIS_DOSSIER = ["A_PAYER", "EN_ATTENTE_VALIDATION", "PAYE"] as const;
export type StatutFraisDossier = (typeof STATUTS_FRAIS_DOSSIER)[number];

export const FRAIS_DOSSIER_STATUT: Record<string, { label: string; tone: "warning" | "info" | "success" }> = {
  A_PAYER: { label: "À payer", tone: "warning" },
  EN_ATTENTE_VALIDATION: { label: "En attente de validation comptable", tone: "info" },
  PAYE: { label: "Payé", tone: "success" },
};
