"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, clients, promoteurs } from "@/db/schema";
import { verifyPassword, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { estBloque, enregistrerEchec, reinitialiser } from "@/lib/rate-limit";

export type LoginState = { error?: string } | undefined;

// Rate-limiting : 5 échecs par identifiant et 30 par adresse IP, sur 15 minutes.
const FENETRE_MS = 15 * 60 * 1000;
const MAX_PAR_IDENTIFIANT = 5;
const MAX_PAR_IP = 30;

async function adresseIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
}

function messageBlocage(sec: number) {
  const min = Math.ceil(sec / 60);
  return `Trop de tentatives de connexion. Réessayez dans ${min} minute${min > 1 ? "s" : ""}.`;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifiant = String(formData.get("identifiant") ?? "").trim();
  const motDePasse = String(formData.get("motDePasse") ?? "");

  if (!identifiant || !motDePasse) {
    return { error: "Merci de renseigner votre identifiant et votre mot de passe." };
  }

  const ip = await adresseIp();
  const cleId = `login:id:${identifiant.toUpperCase()}`;
  const cleIp = `login:ip:${ip}`;
  const parId = estBloque(cleId, MAX_PAR_IDENTIFIANT, FENETRE_MS);
  const parIp = estBloque(cleIp, MAX_PAR_IP, FENETRE_MS);
  if (parId.bloque || parIp.bloque) {
    return { error: messageBlocage(Math.max(parId.reessaiDansSec, parIp.reessaiDansSec)) };
  }

  const echec = (message: string): LoginState => {
    enregistrerEchec(cleId, FENETRE_MS);
    enregistrerEchec(cleIp, FENETRE_MS);
    return { error: message };
  };

  // 1) Comptes internes (Super Admin + tous les rôles du promoteur)
  const staff = await db.query.users.findFirst({ where: eq(users.identifiant, identifiant) });
  if (staff) {
    if (!staff.actif || staff.deletedAt) return echec("Ce compte a été désactivé. Contactez votre direction.");
    const ok = await verifyPassword(motDePasse, staff.passwordHash);
    if (!ok) return echec("Identifiant ou mot de passe incorrect.");

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
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    reinitialiser(cleId);

    redirect(staff.role === "SUPER_ADMIN" ? "/admin" : "/dashboard");
  }

  // 2) Comptes clients
  const client = await db.query.clients.findFirst({ where: eq(clients.identifiant, identifiant) });
  if (client) {
    if (!client.actif || client.deletedAt) return echec("Ce compte a été désactivé. Contactez votre commercial.");
    const ok = await verifyPassword(motDePasse, client.passwordHash);
    if (!ok) return echec("Identifiant ou mot de passe incorrect.");

    const token = await signSession({
      kind: "client",
      clientId: client.id,
      promoteurId: client.promoteurId,
      nom: client.nom,
      prenom: client.prenom,
    });
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    reinitialiser(cleId);

    redirect("/client");
  }

  return echec("Identifiant ou mot de passe incorrect.");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
