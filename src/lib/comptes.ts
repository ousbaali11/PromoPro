import type { Role } from "@/db/schema";
import { ROLES_RECRUTABLES_PAR } from "./roles";

/*
 * Règles d'administration des comptes (suspension, suppression douce,
 * restauration, modification). Même principe que la création : qui peut
 * créer un rôle peut le gérer. Fonctions pures, testées unitairement.
 */

/** Qui peut gérer quel rôle : les directeurs pour leur pôle, le Super Admin pour les trois directions. */
export const ROLES_GERABLES_PAR: Partial<Record<Role, Role[]>> = {
  ...ROLES_RECRUTABLES_PAR,
  SUPER_ADMIN: ["PDG", "DIRECTEUR_COMMERCIAL", "DIRECTEUR_FINANCIER"],
};

export function peutGererCompteInterne(roleActeur: string, roleCible: string): boolean {
  return (ROLES_GERABLES_PAR[roleActeur as Role] ?? []).includes(roleCible as Role);
}

/** Rôles du pôle commercial autorisés à modifier n'importe quel client du promoteur. */
export const POLE_COMMERCIAL: Role[] = [
  "DIRECTEUR_COMMERCIAL",
  "RESPONSABLE_COMMERCIAL",
  "RESPONSABLE_ADMINISTRATIF",
  "ASSISTANT_ADMINISTRATIF",
  "SERVICE_APRES_VENTE",
];

/** Un commercial gère ses propres clients ; le directeur et le responsable commercial, tous. */
export function peutGererClient(
  session: { role: string; userId: string },
  client: { commercialId: string | null },
): boolean {
  if (["DIRECTEUR_COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(session.role)) return true;
  return session.role === "COMMERCIAL" && client.commercialId === session.userId;
}

/** Modification des informations d'un client : le commercial gérant, ou tout membre du pôle commercial. */
export function peutModifierClient(
  session: { role: string; userId: string },
  client: { commercialId: string | null },
): boolean {
  if (POLE_COMMERCIAL.includes(session.role as Role)) return true;
  return session.role === "COMMERCIAL" && client.commercialId === session.userId;
}

export type EtatCompteValeur = "actif" | "suspendu" | "supprime";

export function etatCompte(compte: { actif: boolean; deletedAt: Date | number | string | null }): EtatCompteValeur {
  if (compte.deletedAt) return "supprime";
  if (!compte.actif) return "suspendu";
  return "actif";
}

export const ETAT_LABELS: Record<Exclude<EtatCompteValeur, "actif">, string> = {
  supprime: "(compte supprimé)",
  suspendu: "(suspendu)",
};

/** Statuts de bien / de proposition qui constituent une vente en cours (suppression du client impossible). */
export const STATUTS_VENTE_EN_COURS = ["VENDU", "PROPOSITION_EN_COURS"] as const;
export const STATUTS_PROPOSITION_OUVERTE = ["ENVOYEE", "NEGOCIEE"] as const;

export function aUneVenteEnCours(biensDuClient: { statut: string }[], propositionsDuClient: { statut: string }[]) {
  return (
    biensDuClient.some((b) => (STATUTS_VENTE_EN_COURS as readonly string[]).includes(b.statut)) ||
    propositionsDuClient.some((p) => (STATUTS_PROPOSITION_OUVERTE as readonly string[]).includes(p.statut))
  );
}
