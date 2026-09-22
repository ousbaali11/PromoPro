import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/db/schema";

// NOTE pour la production : déplacer ce secret vers un vrai gestionnaire de
// secrets (variable d'environnement obligatoire, jamais commit). Une valeur
// de repli est fournie pour que le projet tourne dès le premier `npm run dev`.
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "promopro-dev-secret-change-me");
const COOKIE_NAME = "promopro_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours, en secondes

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

/** Signe une session. Utilise l'API Web Crypto (via `jose`) pour rester compatible avec le runtime Edge du middleware. */
export async function signSession(payload: AnySession) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(JWT_SECRET);
}

export async function verifySession(token: string): Promise<AnySession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AnySession;
  } catch {
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
