import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { reinitialisationsMdp, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { envoyerCourriel } from "@/lib/courriel";
import { invaliderEtatCompte } from "@/lib/etat-compte";
import { enregistrerActivite } from "@/lib/journal";
import {
  courrielReinitialisation,
  dateExpiration,
  empreinteJeton,
  genererJeton,
  jetonPlausible,
  jetonUtilisable,
  verifierNouveauMotDePasse,
} from "@/lib/reinitialisation-regles";

/*
 * Mot de passe oublié (comptes internes : PDG → Recouvrement, Super Admin).
 * L'espace client garde son circuit (réinitialisation par le commercial).
 *
 * Demande : l'utilisateur donne son identifiant. S'il existe, est utilisable
 * et a un e-mail, un jeton est généré, stocké haché (une heure, usage unique)
 * et envoyé par e-mail. Sinon rien ne part. La réponse est la même dans tous
 * les cas (MESSAGE_DEMANDE_ENVOYEE) : la page ne révèle jamais si un
 * identifiant existe. Le cas « compte sans e-mail » est distingué pour
 * l'utilisateur légitime par un second message, affiché lui aussi sans
 * révéler l'existence du compte (voir la page).
 *
 * Réinitialisation : jeton vérifié (existe, non expiré, non utilisé, compte
 * utilisable), mot de passe contrôlé, jeton marqué utilisé, toutes les
 * sessions ouvertes du compte révoquées (users.sessions_revoquees_avant, lu à
 * chaque requête protégée par etat-compte.ts), demande et réinitialisation
 * journalisées.
 */

type Utilisateur = typeof users.$inferSelect;

/** L'utilisateur est l'acteur de sa propre demande dans le journal. */
function acteur(u: Utilisateur) {
  return { userId: u.id, nom: u.nom, prenom: u.prenom, promoteurId: u.promoteurId };
}

async function utilisateurParIdentifiant(identifiant: string) {
  const u = await db.query.users.findFirst({ where: eq(users.identifiant, identifiant) });
  if (!u || !u.actif || u.deletedAt) return null;
  return u;
}

export type ResultatDemande = { statut: "envoye" } | { statut: "sans-email" } | { statut: "inconnu" } | { statut: "echec-envoi" };

/**
 * Traite une demande. `origine` est l'origine publique de l'application
 * (https://…) pour construire le lien. Ne lève jamais : un échec d'envoi est
 * journalisé et renvoyé en valeur.
 */
export async function demanderReinitialisation(identifiant: string, origine: string): Promise<ResultatDemande> {
  const u = await utilisateurParIdentifiant(identifiant);
  if (!u) return { statut: "inconnu" };
  if (!u.email) {
    await enregistrerActivite({
      acteur: acteur(u),
      action: "MODIFICATION",
      cibleType: "user",
      cibleId: u.id,
      cibleNom: `${u.prenom} ${u.nom}`,
      details: "Demande de réinitialisation du mot de passe refusée : aucun e-mail renseigné sur le compte",
    });
    return { statut: "sans-email" };
  }
  const jeton = genererJeton();
  await db.insert(reinitialisationsMdp).values({ userId: u.id, tokenHash: empreinteJeton(jeton), expiresAt: dateExpiration() });
  const lien = `${origine}/reinitialiser-mot-de-passe?token=${jeton}`;
  const { sujet, texte, html } = courrielReinitialisation(u.prenom, lien);
  const envoi = await envoyerCourriel({ a: u.email, sujet, texte, html });
  await enregistrerActivite({
    acteur: acteur(u),
    action: "MODIFICATION",
    cibleType: "user",
    cibleId: u.id,
    cibleNom: `${u.prenom} ${u.nom}`,
    details: envoi.ok
      ? `Demande de réinitialisation du mot de passe : e-mail envoyé à ${masquerEmail(u.email)} (lien valable une heure)`
      : `Demande de réinitialisation du mot de passe : envoi de l'e-mail impossible (${envoi.motif})`,
  });
  return envoi.ok ? { statut: "envoye" } : { statut: "echec-envoi" };
}

/** Jeton valide → utilisateur et ligne ; sinon null (jeton inconnu, expiré, déjà utilisé, compte inutilisable). */
export async function verifierJeton(jeton: string): Promise<{ ligne: typeof reinitialisationsMdp.$inferSelect; utilisateur: Utilisateur } | null> {
  if (!jetonPlausible(jeton)) return null;
  const ligne = await db.query.reinitialisationsMdp.findFirst({ where: eq(reinitialisationsMdp.tokenHash, empreinteJeton(jeton)) });
  if (!ligne || !jetonUtilisable(ligne)) return null;
  const utilisateur = await db.query.users.findFirst({ where: eq(users.id, ligne.userId) });
  if (!utilisateur || !utilisateur.actif || utilisateur.deletedAt) return null;
  return { ligne, utilisateur };
}

export type ResultatReinitialisation = { ok: true } | { ok: false; erreur: string; jetonInvalide?: boolean };

export const MESSAGE_JETON_INVALIDE = "Ce lien de réinitialisation n'est plus valable : il a expiré, a déjà servi ou n'existe pas. Faites une nouvelle demande.";

export async function reinitialiserMotDePasse(jeton: string, motDePasse: string, confirmation: string): Promise<ResultatReinitialisation> {
  const v = await verifierJeton(jeton);
  if (!v) return { ok: false, erreur: MESSAGE_JETON_INVALIDE, jetonInvalide: true };
  const erreur = verifierNouveauMotDePasse(motDePasse, confirmation, v.utilisateur.identifiant);
  if (erreur) return { ok: false, erreur };

  // Usage unique : le jeton est marqué utilisé de façon conditionnelle, deux soumissions simultanées ne passent pas toutes les deux
  const maintenant = new Date();
  const marque = await db
    .update(reinitialisationsMdp)
    .set({ usedAt: maintenant })
    .where(and(eq(reinitialisationsMdp.id, v.ligne.id), isNull(reinitialisationsMdp.usedAt)))
    .returning({ id: reinitialisationsMdp.id });
  if (marque.length === 0) return { ok: false, erreur: MESSAGE_JETON_INVALIDE, jetonInvalide: true };

  // Révocation arrondie à la seconde : l'instant d'émission d'un jeton (iat) est en secondes, une
  // connexion faite dans la même seconde que la réinitialisation ne doit pas être refusée
  const revocation = new Date(Math.floor(maintenant.getTime() / 1000) * 1000);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(motDePasse), sessionsRevoqueesAvant: revocation })
    .where(eq(users.id, v.utilisateur.id));
  invaliderEtatCompte("user", v.utilisateur.id);
  await enregistrerActivite({
    acteur: acteur(v.utilisateur),
    action: "MODIFICATION",
    cibleType: "user",
    cibleId: v.utilisateur.id,
    cibleNom: `${v.utilisateur.prenom} ${v.utilisateur.nom}`,
    details: "Mot de passe réinitialisé par e-mail · toutes les sessions ouvertes ont été fermées",
  });
  return { ok: true };
}

/** « k…@promopro.ma » : assez pour reconnaître l'adresse dans le journal, sans la recopier. */
export function masquerEmail(email: string) {
  const [local, domaine] = email.split("@");
  if (!domaine) return "…";
  return `${local.slice(0, 1)}…@${domaine}`;
}
