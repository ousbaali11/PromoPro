import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

/** Requires a logged-in staff (promoteur or super admin) session, or redirects to /login. */
export async function requireStaffSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.kind !== "staff") {
    redirect("/login");
  }
  return session as SessionPayload;
}

/** Requires a logged-in client session, or redirects to /login. */
export async function requireClientSession(): Promise<ClientSessionPayload> {
  const session = await getSession();
  if (!session || session.kind !== "client") {
    redirect("/login");
  }
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
