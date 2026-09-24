import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, clients, promoteurs } from "@/db/schema";

/*
 * État d'un compte pour la révocation immédiate des sessions : un compte
 * suspendu ou supprimé, ou dont le promoteur est suspendu, perd l'accès dès
 * la requête protégée suivante (pages, Server Actions, routes API), pas
 * seulement à la prochaine connexion.
 *
 * Un cache mémoire de quelques secondes évite une lecture de la base à chaque
 * clic ; il est invalidé explicitement par les actions qui changent l'état
 * d'un compte ou d'un promoteur (voir comptes-service.ts et admin/actions.ts),
 * si bien que la révocation reste immédiate sur une instance.
 */

export const TTL_ETAT_COMPTE_MS = 5_000;

type Entree = { actif: boolean; expire: number };
const g = globalThis as unknown as { __promoproEtatComptes?: Map<string, Entree> };
const cache: Map<string, Entree> = g.__promoproEtatComptes ?? new Map();
if (process.env.NODE_ENV !== "production") g.__promoproEtatComptes = cache;

function lireCache(cle: string, now: number) {
  const e = cache.get(cle);
  if (!e) return null;
  if (e.expire < now) {
    cache.delete(cle);
    return null;
  }
  return e.actif;
}

async function promoteurActif(promoteurId: string | null): Promise<boolean> {
  if (!promoteurId) return true; // Super Admin
  const p = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, promoteurId), columns: { statut: true } });
  return p?.statut === "ACTIF";
}

/** Compte interne utilisable ? (existe, ni suspendu ni supprimé, promoteur actif ou Super Admin) */
export async function compteStaffActif(userId: string, now = Date.now()): Promise<boolean> {
  const cle = `user:${userId}`;
  const enCache = lireCache(cle, now);
  if (enCache !== null) return enCache;
  const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { actif: true, deletedAt: true, promoteurId: true, role: true } });
  const actif = !!u && u.actif && !u.deletedAt && (u.role === "SUPER_ADMIN" || (await promoteurActif(u.promoteurId)));
  cache.set(cle, { actif, expire: now + TTL_ETAT_COMPTE_MS });
  return actif;
}

/** Compte client utilisable ? (existe, ni suspendu ni supprimé, promoteur actif) */
export async function compteClientActif(clientId: string, now = Date.now()): Promise<boolean> {
  const cle = `client:${clientId}`;
  const enCache = lireCache(cle, now);
  if (enCache !== null) return enCache;
  const c = await db.query.clients.findFirst({ where: eq(clients.id, clientId), columns: { actif: true, deletedAt: true, promoteurId: true } });
  const actif = !!c && c.actif && !c.deletedAt && (await promoteurActif(c.promoteurId));
  cache.set(cle, { actif, expire: now + TTL_ETAT_COMPTE_MS });
  return actif;
}

/** À appeler après toute suspension / suppression / restauration d'un compte. */
export function invaliderEtatCompte(type: "user" | "client", id: string) {
  cache.delete(`${type}:${id}`);
}

/** À appeler après tout changement de statut d'un promoteur (tous ses comptes sont concernés). */
export function invaliderTousLesEtats() {
  cache.clear();
}
