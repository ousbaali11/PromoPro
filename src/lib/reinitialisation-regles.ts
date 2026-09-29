import { createHash, randomBytes } from "node:crypto";

/*
 * Règles pures de la réinitialisation de mot de passe par e-mail (comptes
 * internes) : jeton, empreinte, durée de validité, robustesse du nouveau mot
 * de passe. Sans base ni réseau : testées dans tests/unit/reinitialisation.test.ts.
 */

/** Durée de validité d'un lien de réinitialisation : une heure. */
export const DUREE_JETON_MS = 60 * 60 * 1000;

/** Longueur minimale d'un mot de passe choisi par l'utilisateur. */
export const MOT_DE_PASSE_MIN = 8;
/** bcrypt n'utilise que les 72 premiers octets : au-delà, la fin du mot de passe serait ignorée. */
export const MOT_DE_PASSE_MAX = 72;

/** Jeton aléatoire (256 bits, base64url) transmis dans le lien ; seule son empreinte est stockée. */
export function genererJeton() {
  return randomBytes(32).toString("base64url");
}

export function empreinteJeton(jeton: string) {
  return createHash("sha256").update(jeton).digest("hex");
}

export function jetonPlausible(jeton: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(jeton);
}

export function dateExpiration(now = new Date()) {
  return new Date(now.getTime() + DUREE_JETON_MS);
}

/** Un jeton est utilisable s'il n'a pas servi et n'est pas expiré. */
export function jetonUtilisable(ligne: { expiresAt: Date | number; usedAt: Date | number | null }, now = new Date()) {
  if (ligne.usedAt) return false;
  return new Date(ligne.expiresAt).getTime() > now.getTime();
}

/**
 * Robustesse d'un mot de passe choisi : 8 caractères au moins, 72 au plus,
 * au moins une lettre et un chiffre, différent de l'identifiant, et une
 * confirmation identique. Renvoie null si acceptable, sinon le message.
 */
export function verifierNouveauMotDePasse(motDePasse: string, confirmation: string, identifiant: string): string | null {
  if (!motDePasse) return "Merci de choisir un mot de passe.";
  if (motDePasse.length < MOT_DE_PASSE_MIN) return `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`;
  if (motDePasse.length > MOT_DE_PASSE_MAX) return `Le mot de passe ne peut pas dépasser ${MOT_DE_PASSE_MAX} caractères.`;
  if (!/[A-Za-z]/.test(motDePasse) || !/\d/.test(motDePasse)) return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  if (motDePasse.trim().toUpperCase() === identifiant.trim().toUpperCase()) return "Le mot de passe ne peut pas être identique à l'identifiant.";
  if (motDePasse !== confirmation) return "Les deux mots de passe ne sont pas identiques.";
  return null;
}

/** Message affiché après toute demande, que le compte existe ou non (aucune information révélée). */
export const MESSAGE_DEMANDE_ENVOYEE = "Si ce compte existe, un e-mail a été envoyé.";

/** Sujet et corps de l'e-mail de réinitialisation. */
export function courrielReinitialisation(prenom: string, lien: string) {
  const sujet = "PromoPro — réinitialisation de votre mot de passe";
  const texte = [
    `Bonjour ${prenom},`,
    "",
    "Vous avez demandé à réinitialiser le mot de passe de votre compte PromoPro. Ouvrez ce lien pour en choisir un nouveau (valable une heure, utilisable une seule fois) :",
    "",
    lien,
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
    "",
    "PromoPro",
  ].join("\n");
  const html = `<p>Bonjour ${echapper(prenom)},</p>
<p>Vous avez demandé à réinitialiser le mot de passe de votre compte PromoPro. Ouvrez ce lien pour en choisir un nouveau (valable une heure, utilisable une seule fois) :</p>
<p><a href="${echapper(lien)}">${echapper(lien)}</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>
<p>PromoPro</p>`;
  return { sujet, texte, html };
}

function echapper(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
