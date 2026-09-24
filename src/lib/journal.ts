import { db } from "@/db/client";
import { journalActivite } from "@/db/schema";

/*
 * Journal d'activité (traçabilité). Chaque création, modification,
 * suppression, suspension ou restauration d'un compte ou d'une entité y
 * laisse une ligne lisible même si l'acteur ou la cible disparaît ensuite :
 * les noms sont copiés au moment de l'action.
 */

export const ACTIONS_JOURNAL = ["CREATION", "MODIFICATION", "SUPPRESSION", "SUSPENSION", "RESTAURATION", "IMPORT"] as const;
export type ActionJournal = (typeof ACTIONS_JOURNAL)[number];

export const ACTION_LABELS: Record<ActionJournal, string> = {
  CREATION: "Création",
  MODIFICATION: "Modification",
  SUPPRESSION: "Suppression",
  SUSPENSION: "Suspension",
  RESTAURATION: "Restauration",
  IMPORT: "Import",
};

export const CIBLE_LABELS: Record<string, string> = {
  user: "Compte interne",
  client: "Client",
  promoteur: "Promoteur",
  projet: "Projet",
  bien: "Bien",
  contrat: "Contrat",
  echeancier: "Échéancier",
  tma: "Travaux modificatifs",
  prospects: "Prospects",
};

type Acteur = { userId: string; nom: string; prenom: string; promoteurId: string | null };

export async function enregistrerActivite(entree: {
  acteur: Acteur;
  action: ActionJournal;
  cibleType: string;
  cibleId?: string | null;
  cibleNom: string;
  details?: string | null;
  /** Promoteur concerné (par défaut celui de l'acteur ; le Super Admin précise celui du promoteur touché). */
  promoteurId?: string | null;
}) {
  await db.insert(journalActivite).values({
    promoteurId: entree.promoteurId === undefined ? entree.acteur.promoteurId : entree.promoteurId,
    acteurId: entree.acteur.userId,
    acteurNom: `${entree.acteur.prenom} ${entree.acteur.nom}`.trim(),
    action: entree.action,
    cibleType: entree.cibleType,
    cibleId: entree.cibleId ?? null,
    cibleNom: entree.cibleNom,
    details: entree.details ?? null,
  });
}

/**
 * Décrit les champs modifiés entre deux versions d'une entité :
 * « Prix : 850 000 → 870 000 · Surface : 68 → 70 ». Retourne null si rien n'a changé.
 * Les champs absents de `libelles` sont ignorés (mots de passe, identifiants techniques…).
 */
export function decrireChangements<T extends Record<string, unknown>>(
  avant: T,
  apres: Partial<T>,
  libelles: Partial<Record<keyof T, string>>,
): string | null {
  const parts: string[] = [];
  for (const cle of Object.keys(libelles) as (keyof T)[]) {
    if (!(cle in apres)) continue;
    const a = normaliser(avant[cle]);
    const b = normaliser(apres[cle]);
    if (a === b) continue;
    parts.push(`${libelles[cle]} : ${a || "—"} → ${b || "—"}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function normaliser(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return new Intl.NumberFormat("fr-FR").format(v);
  return String(v).trim();
}
