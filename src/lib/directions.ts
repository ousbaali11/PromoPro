import type { Role } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/roles";

/*
 * Directions d'un promoteur (PDG, Directeur Commercial, Directeur Financier).
 * Un promoteur peut avoir plusieurs titulaires d'un même rôle, ou aucun : rien
 * n'est bloqué, mais le Super Admin est prévenu quand une suspension ou une
 * suppression laisserait le promoteur sans aucun titulaire d'un rôle.
 * Fonctions pures, testées dans tests/unit/directions.test.ts.
 */

export const ROLES_DIRECTION: Role[] = ["PDG", "DIRECTEUR_COMMERCIAL", "DIRECTEUR_FINANCIER"];

export function estRoleDirection(role: string): role is Role {
  return (ROLES_DIRECTION as string[]).includes(role);
}

type Direction = { id: string; role: Role; actif: boolean; deletedAt: Date | number | string | null };

/** Titulaires en état d'exercer : ni suspendus, ni supprimés. */
export function titulairesActifs<T extends Direction>(directions: T[], role: Role): T[] {
  return directions.filter((d) => d.role === role && d.actif && !d.deletedAt);
}

/**
 * Message à ajouter à la confirmation de suspension / suppression de `cible`
 * si elle est le dernier titulaire actif de son rôle chez ce promoteur ;
 * null sinon (un autre titulaire reste, ou la cible n'exerce déjà plus).
 */
export function avertissementDernierTitulaire(directions: Direction[], cible: Direction): string | null {
  if (!cible.actif || cible.deletedAt) return null;
  const autres = titulairesActifs(directions, cible.role).filter((d) => d.id !== cible.id);
  if (autres.length > 0) return null;
  return `Ce promoteur n'aura plus aucun ${ROLE_LABELS[cible.role]} après cette action.`;
}

/** Rôles sans aucun titulaire actif (affichés sur la fiche du promoteur). */
export function rolesSansTitulaire(directions: Direction[]): Role[] {
  return ROLES_DIRECTION.filter((r) => titulairesActifs(directions, r).length === 0);
}

/** Tri d'affichage : par rôle (PDG, DC, DF) puis par nom. */
export function trierDirections<T extends Direction & { nom: string }>(directions: T[]): T[] {
  return [...directions].sort((a, b) => ROLES_DIRECTION.indexOf(a.role) - ROLES_DIRECTION.indexOf(b.role) || a.nom.localeCompare(b.nom));
}
