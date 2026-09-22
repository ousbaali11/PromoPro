"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, clients, promoteurs } from "@/db/schema";
import { verifyPassword, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export type LoginState = { error?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifiant = String(formData.get("identifiant") ?? "").trim();
  const motDePasse = String(formData.get("motDePasse") ?? "");

  if (!identifiant || !motDePasse) {
    return { error: "Merci de renseigner votre identifiant et votre mot de passe." };
  }

  // 1) Comptes internes (Super Admin + tous les rôles du promoteur)
  const staff = await db.query.users.findFirst({ where: eq(users.identifiant, identifiant) });
  if (staff) {
    if (!staff.actif) return { error: "Ce compte a été désactivé." };
    const ok = await verifyPassword(motDePasse, staff.passwordHash);
    if (!ok) return { error: "Identifiant ou mot de passe incorrect." };

    if (staff.promoteurId) {
      const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, staff.promoteurId) });
      if (staff.role !== "SUPER_ADMIN" && promoteur?.statut !== "ACTIF") {
        return { error: "L'abonnement de votre promoteur n'est pas actif. Contactez votre administrateur." };
      }
    }

    const token = await signSession({
      kind: "staff",
      userId: staff.id,
      role: staff.role,
      promoteurId: staff.promoteurId,
      nom: staff.nom,
      prenom: staff.prenom,
    });
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" });

    redirect(staff.role === "SUPER_ADMIN" ? "/admin" : "/dashboard");
  }

  // 2) Comptes clients
  const client = await db.query.clients.findFirst({ where: eq(clients.identifiant, identifiant) });
  if (client) {
    const ok = await verifyPassword(motDePasse, client.passwordHash);
    if (!ok) return { error: "Identifiant ou mot de passe incorrect." };

    const token = await signSession({
      kind: "client",
      clientId: client.id,
      promoteurId: client.promoteurId,
      nom: client.nom,
      prenom: client.prenom,
    });
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" });

    redirect("/client");
  }

  return { error: "Identifiant ou mot de passe incorrect." };
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
