import { cookies } from "next/headers";
import { redirect } from "next/navigation";
// (les cookies ne peuvent pas être modifiés pendant le rendu : la fermeture passe par une route)
import { compteClientActif, compteStaffActif } from "./etat-compte";
import {
  SESSION_COOKIE,
  verifySession,
  type SessionPayload,
  type ClientSessionPayload,
} from "./auth";

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/**
 * Session staff dont le compte est encore utilisable (ni suspendu, ni
 * supprimé, promoteur actif), sinon null. Vérifié à chaque requête protégée
 * (cache de 5 s invalidé par les actions de suspension / suppression, voir
 * src/lib/etat-compte.ts). Pour les routes API, qui répondent 401 au lieu de
 * rediriger.
 */
export async function getStaffSessionActive(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || session.kind !== "staff") return null;
  if (!(await compteStaffActif(session.userId))) return null;
  return session as SessionPayload;
}

/** Requires a logged-in staff (promoteur or super admin) session, or redirects to /login. */
export async function requireStaffSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.kind !== "staff") {
    redirect("/login");
  }
  // Suspension ou suppression douce : la session en cours est fermée sans attendre son expiration
  if (!(await getStaffSessionActive())) await fermerSession();
  return session as SessionPayload;
}

/**
 * Compte suspendu, supprimé ou promoteur suspendu pendant la session : on
 * redirige vers la route qui supprime le cookie puis renvoie à /login avec un
 * motif (un Server Component n'a pas le droit de modifier les cookies ; le
 * faire ici renvoyait une erreur 500 au lieu de la page de connexion).
 */
async function fermerSession(): Promise<never> {
  redirect("/api/session/fermer?motif=compte-inactif");
}

/** Requires a logged-in client session, or redirects to /login. */
export async function requireClientSession(): Promise<ClientSessionPayload> {
  const session = await getSession();
  if (!session || session.kind !== "client") {
    redirect("/login");
  }
  // Suspension / suppression du client, ou suspension de son promoteur : session fermée immédiatement
  if (!(await compteClientActif(session.clientId))) await fermerSession();
  return session as ClientSessionPayload;
}

/** Requires one of the given roles, or redirects to the dashboard home with no access. */
export async function requireRole(roles: string[]): Promise<SessionPayload> {
  const session = await requireStaffSession();
  if (!roles.includes(session.role)) {
    redirect("/dashboard?erreur=acces-refuse");
  }
  return session;
}

/**
 * Session (staff ou client) dont le compte est encore actif, sinon null.
 * Pour les routes API (/api/upload, /api/files) : un compte suspendu ou
 * supprimé ne doit plus rien lire ni déposer, même avec un cookie encore
 * valide — même règle que requireStaffSession / requireClientSession.
 */
export async function getSessionActive(): Promise<SessionPayload | ClientSessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.kind === "staff") return getStaffSessionActive();
  if (!(await compteClientActif(session.clientId))) return null;
  return session as ClientSessionPayload;
}
