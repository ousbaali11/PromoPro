import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, clients } from "@/db/schema";
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
 * Session staff dont le compte est encore actif (ni suspendu, ni supprimé),
 * sinon null. Pour les routes API, qui répondent 401 au lieu de rediriger.
 */
export async function getStaffSessionActive(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || session.kind !== "staff") return null;
  const compte = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { actif: true, deletedAt: true },
  });
  if (!compte || !compte.actif || compte.deletedAt) return null;
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

async function fermerSession(): Promise<never> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Requires a logged-in client session, or redirects to /login. */
export async function requireClientSession(): Promise<ClientSessionPayload> {
  const session = await getSession();
  if (!session || session.kind !== "client") {
    redirect("/login");
  }
  const compte = await db.query.clients.findFirst({
    where: eq(clients.id, session.clientId),
    columns: { actif: true, deletedAt: true },
  });
  if (!compte || !compte.actif || compte.deletedAt) await fermerSession();
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
  const compte = await db.query.clients.findFirst({
    where: eq(clients.id, session.clientId),
    columns: { actif: true, deletedAt: true },
  });
  if (!compte || !compte.actif || compte.deletedAt) return null;
  return session as ClientSessionPayload;
}
