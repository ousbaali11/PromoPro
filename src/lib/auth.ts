import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/db/schema";

const DEV_FALLBACK_SECRET = "promopro-dev-secret-change-me";
const COOKIE_NAME = "promopro_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours, en secondes

let cachedSecret: Uint8Array | null = null;
let warned = false;

/**
 * Secret de signature des sessions.
 * - En production (`NODE_ENV=production`), `JWT_SECRET` est OBLIGATOIRE : le
 *   serveur refuse de signer ou vérifier une session sans lui (erreur au
 *   premier appel, donc dès la première requête authentifiée / connexion).
 * - Pendant `next build` (NEXT_PHASE=phase-production-build) le contrôle est
 *   différé pour que la compilation reste possible sans secret.
 * - En développement, une valeur de repli est utilisée avec un avertissement.
 */
function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = new TextEncoder().encode(fromEnv);
    return cachedSecret;
  }
  const isProd = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
  if (isProd) {
    throw new Error(
      "JWT_SECRET manquant ou trop court (16 caractères minimum) : obligatoire en production. " +
        "Générez-en un avec `openssl rand -base64 48` (voir SECURITY.md).",
    );
  }
  if (!warned) {
    warned = true;
    console.warn("[auth] JWT_SECRET non défini : secret de développement utilisé. Ne pas déployer ainsi.");
  }
  cachedSecret = new TextEncoder().encode(DEV_FALLBACK_SECRET);
  return cachedSecret;
}

export type SessionPayload = {
  userId: string;
  role: Role | "SUPER_ADMIN";
  promoteurId: string | null;
  nom: string;
  prenom: string;
  kind: "staff"; // utilisateur interne (promoteur ou super admin)
};

export type ClientSessionPayload = {
  clientId: string;
  promoteurId: string;
  nom: string;
  prenom: string;
  kind: "client";
};

export type AnySession = SessionPayload | ClientSessionPayload;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** Signe une session. Utilise l'API Web Crypto (via `jose`) pour rester compatible avec le runtime Edge du proxy. */
export async function signSession(payload: AnySession) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<AnySession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AnySession;
  } catch (e) {
    // Un secret manquant en production doit remonter (erreur de configuration), pas être avalé.
    if (e instanceof Error && e.message.startsWith("JWT_SECRET")) throw e;
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export { SESSION_MAX_AGE };

/** Génère un identifiant de connexion court et lisible, ex. PP-7F3K2Q */
export function generateIdentifiant(prefix = "PP") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans caractères ambigus
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${code}`;
}

/** Génère un mot de passe temporaire lisible, ex. "orange42" */
export function generateTempPassword() {
  const words = ["atlas", "orange", "cedre", "ocean", "grenat", "safran", "iris", "onyx"];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(10 + Math.random() * 89);
  return `${w}${n}`;
}
