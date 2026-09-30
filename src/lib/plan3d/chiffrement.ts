import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * Chiffrement symétrique des secrets stockés en base (clés d'API des
 * fournisseurs de modèles 3D) : AES-256-GCM, clé dérivée par SHA-256 de la
 * variable d'environnement SECRETS_ENCRYPTION_KEY (jamais en base, jamais
 * envoyée au navigateur). Format stocké : v1:<iv>:<tag>:<chiffré>, en base64.
 * Le déchiffrement n'a lieu que côté serveur, au moment de l'appel au
 * fournisseur ; l'interface n'affiche que les derniers caractères (masquerCle).
 */

export const VARIABLE_CLE = "SECRETS_ENCRYPTION_KEY";
const LONGUEUR_MIN = 16;

export function chiffrementDisponible(env: Record<string, string | undefined> = process.env) {
  return (env[VARIABLE_CLE]?.trim().length ?? 0) >= LONGUEUR_MIN;
}

function cle(env: Record<string, string | undefined>) {
  const secret = env[VARIABLE_CLE]?.trim();
  if (!secret || secret.length < LONGUEUR_MIN) {
    throw new Error(`${VARIABLE_CLE} manquante ou trop courte (${LONGUEUR_MIN} caractères minimum) : impossible de chiffrer ou déchiffrer un secret.`);
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function chiffrer(texte: string, env: Record<string, string | undefined> = process.env): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cle(env), iv);
  const chiffre = Buffer.concat([chiffreur.update(texte, "utf8"), chiffreur.final()]);
  return ["v1", iv.toString("base64"), chiffreur.getAuthTag().toString("base64"), chiffre.toString("base64")].join(":");
}

export function dechiffrer(stocke: string, env: Record<string, string | undefined> = process.env): string {
  const [version, iv, tag, chiffre] = stocke.split(":");
  if (version !== "v1" || !iv || !tag || !chiffre) throw new Error("Secret stocké dans un format inconnu.");
  const dechiffreur = createDecipheriv("aes-256-gcm", cle(env), Buffer.from(iv, "base64"));
  dechiffreur.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([dechiffreur.update(Buffer.from(chiffre, "base64")), dechiffreur.final()]).toString("utf8");
}

/** « ••••••••3f9a » : seuls les quatre derniers caractères sont montrés, comme un numéro de carte. */
export function masquerCle(cleApi: string, visibles = 4) {
  const fin = cleApi.slice(-visibles);
  return `${"•".repeat(Math.max(4, Math.min(12, cleApi.length - fin.length)))}${fin}`;
}
