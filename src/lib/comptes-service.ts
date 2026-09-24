import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { invaliderEtatCompte } from "@/lib/etat-compte";
import { users, clients, biens, propositions } from "@/db/schema";
import type { SessionPayload } from "@/lib/auth";
import { enregistrerActivite } from "@/lib/journal";
import { aUneVenteEnCours, peutGererClient, peutGererCompteInterne } from "@/lib/comptes";

/*
 * Suspension, suppression douce et restauration des comptes internes et
 * clients. Rien n'est jamais effacé : `actif=false` ou `deletedAt` renseigné,
 * toutes les données liées restent en place. Chaque geste est journalisé.
 *
 * Logique partagée par les Server Actions (boutons des fiches et tableaux) et
 * par la route POST /api/comptes/restaurer (bouton « Annuler » du toast, qui
 * peut être cliqué depuis n'importe quelle page).
 */

export type ResultatCompte = { ok: true } | { error: string };
export type TypeCompte = "client" | "user";

const CHEMINS = ["/dashboard/equipe", "/dashboard/clients", "/dashboard/journal", "/admin", "/admin/journal"];
function rafraichir(extra: string[] = []) {
  for (const p of [...CHEMINS, ...extra]) revalidatePath(p);
}

type Utilisateur = typeof users.$inferSelect;
type Client = typeof clients.$inferSelect;
type Cible<T> = { error: string } | { cible: T };

// --- Comptes internes -------------------------------------------------------

async function cibleInterne(session: SessionPayload, userId: string): Promise<Cible<Utilisateur>> {
  const cible = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!cible) return { error: "Compte introuvable." };
  if (session.role !== "SUPER_ADMIN" && cible.promoteurId !== session.promoteurId) return { error: "Compte introuvable." };
  if (cible.id === session.userId) return { error: "Vous ne pouvez pas agir sur votre propre compte." };
  if (!peutGererCompteInterne(session.role, cible.role)) {
    return { error: "Vous ne pouvez gérer que les comptes des rôles que vous êtes autorisé à créer." };
  }
  return { cible };
}

export async function suspendreUtilisateur(session: SessionPayload, userId: string): Promise<ResultatCompte> {
  const r = await cibleInterne(session, userId);
  if ("error" in r) return r;
  if (!r.cible.actif) return { error: "Ce compte est déjà suspendu." };
  await db.update(users).set({ actif: false }).where(eq(users.id, userId));
  invaliderEtatCompte("user", userId);
  await enregistrerActivite({
    acteur: session,
    action: "SUSPENSION",
    cibleType: "user",
    cibleId: userId,
    cibleNom: `${r.cible.prenom} ${r.cible.nom}`,
    details: `Rôle : ${r.cible.role} · identifiant ${r.cible.identifiant}`,
    promoteurId: r.cible.promoteurId,
  });
  rafraichir();
  return { ok: true };
}

export async function supprimerUtilisateur(session: SessionPayload, userId: string): Promise<ResultatCompte> {
  const r = await cibleInterne(session, userId);
  if ("error" in r) return r;
  if (r.cible.deletedAt) return { error: "Ce compte est déjà supprimé." };
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
  invaliderEtatCompte("user", userId);
  await enregistrerActivite({
    acteur: session,
    action: "SUPPRESSION",
    cibleType: "user",
    cibleId: userId,
    cibleNom: `${r.cible.prenom} ${r.cible.nom}`,
    details: `Suppression douce (historique conservé) · rôle ${r.cible.role} · identifiant ${r.cible.identifiant}`,
    promoteurId: r.cible.promoteurId,
  });
  rafraichir();
  return { ok: true };
}

export async function restaurerUtilisateur(session: SessionPayload, userId: string): Promise<ResultatCompte> {
  const r = await cibleInterne(session, userId);
  if ("error" in r) return r;
  if (r.cible.actif && !r.cible.deletedAt) return { error: "Ce compte est déjà actif." };
  const etaitSupprime = !!r.cible.deletedAt;
  await db.update(users).set({ actif: true, deletedAt: null }).where(eq(users.id, userId));
  invaliderEtatCompte("user", userId);
  await enregistrerActivite({
    acteur: session,
    action: "RESTAURATION",
    cibleType: "user",
    cibleId: userId,
    cibleNom: `${r.cible.prenom} ${r.cible.nom}`,
    details: etaitSupprime ? "Annulation de la suppression" : "Levée de la suspension",
    promoteurId: r.cible.promoteurId,
  });
  rafraichir();
  return { ok: true };
}

// --- Clients ----------------------------------------------------------------

async function cibleClient(session: SessionPayload, clientId: string): Promise<Cible<Client>> {
  const cible = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!cible || cible.promoteurId !== session.promoteurId) return { error: "Client introuvable." };
  if (!peutGererClient(session, cible)) return { error: "Seul le commercial qui gère ce client, ou sa direction, peut agir sur ce compte." };
  return { cible };
}

/** Le client a-t-il une vente ou une proposition en cours ? (suppression alors refusée, suspension proposée) */
export async function clientAUneVenteEnCours(clientId: string) {
  const b = await db.query.biens.findMany({ where: eq(biens.clientId, clientId) });
  const p = await db.query.propositions.findMany({ where: eq(propositions.clientId, clientId) });
  return aUneVenteEnCours(b, p);
}

export async function suspendreClient(session: SessionPayload, clientId: string): Promise<ResultatCompte> {
  const r = await cibleClient(session, clientId);
  if ("error" in r) return r;
  if (!r.cible.actif) return { error: "Ce compte est déjà suspendu." };
  await db.update(clients).set({ actif: false }).where(eq(clients.id, clientId));
  invaliderEtatCompte("client", clientId);
  await enregistrerActivite({
    acteur: session,
    action: "SUSPENSION",
    cibleType: "client",
    cibleId: clientId,
    cibleNom: `${r.cible.prenom} ${r.cible.nom}`,
    details: `Identifiant ${r.cible.identifiant} · l'accès à l'espace client est fermé, l'historique conservé`,
  });
  rafraichir([`/dashboard/clients/${clientId}`]);
  return { ok: true };
}

export async function supprimerClient(session: SessionPayload, clientId: string): Promise<ResultatCompte> {
  const r = await cibleClient(session, clientId);
  if ("error" in r) return r;
  if (r.cible.deletedAt) return { error: "Ce compte est déjà supprimé." };
  if (await clientAUneVenteEnCours(clientId)) {
    return { error: "Ce client a une vente ou une proposition en cours : suspendez son compte plutôt que de le supprimer." };
  }
  await db.update(clients).set({ deletedAt: new Date() }).where(eq(clients.id, clientId));
  invaliderEtatCompte("client", clientId);
  await enregistrerActivite({
    acteur: session,
    action: "SUPPRESSION",
    cibleType: "client",
    cibleId: clientId,
    cibleNom: `${r.cible.prenom} ${r.cible.nom}`,
    details: `Suppression douce (historique conservé) · identifiant ${r.cible.identifiant}`,
  });
  rafraichir([`/dashboard/clients/${clientId}`]);
  return { ok: true };
}

export async function restaurerClient(session: SessionPayload, clientId: string): Promise<ResultatCompte> {
  const r = await cibleClient(session, clientId);
  if ("error" in r) return r;
  if (r.cible.actif && !r.cible.deletedAt) return { error: "Ce compte est déjà actif." };
  const etaitSupprime = !!r.cible.deletedAt;
  await db.update(clients).set({ actif: true, deletedAt: null }).where(eq(clients.id, clientId));
  invaliderEtatCompte("client", clientId);
  await enregistrerActivite({
    acteur: session,
    action: "RESTAURATION",
    cibleType: "client",
    cibleId: clientId,
    cibleNom: `${r.cible.prenom} ${r.cible.nom}`,
    details: etaitSupprime ? "Annulation de la suppression" : "Levée de la suspension",
  });
  rafraichir([`/dashboard/clients/${clientId}`]);
  return { ok: true };
}

export async function restaurerCompte(session: SessionPayload, type: TypeCompte, id: string): Promise<ResultatCompte> {
  return type === "client" ? restaurerClient(session, id) : restaurerUtilisateur(session, id);
}
