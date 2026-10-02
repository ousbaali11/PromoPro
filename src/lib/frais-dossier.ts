import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, clients, fraisDossier, projets, users } from "@/db/schema";
import { notifyClient } from "@/lib/notifications";
import { enregistrerActivite } from "@/lib/journal";
import { chargerPromoteur } from "@/lib/promoteurs";
import { exigerStockageInscriptible } from "@/lib/storage";
import { genererEtStockerRecuFraisDossier } from "@/lib/pdf/recu-frais-dossier";
import type { SessionPayload } from "@/lib/auth";

/*
 * Frais de dossier, par bien vendu, sur le modèle du syndic (table dédiée,
 * pas une tranche de l'échéancier) : le Comptable Interne définit — et peut
 * modifier tant qu'ils ne sont pas payés — le montant dû par le client d'un
 * bien ; le client le voit dans son espace, est notifié à la définition et à
 * chaque modification, déclare son paiement avec preuve ; le Comptable
 * Interne valide (reçu PDF généré, client notifié). Définition et validation
 * sont tracées au journal d'activité. Statuts : A_PAYER →
 * EN_ATTENTE_VALIDATION → PAYE.
 */

export { FRAIS_DOSSIER_STATUT, STATUTS_FRAIS_DOSSIER } from "./frais-dossier-regles";

export type FraisDossier = typeof fraisDossier.$inferSelect;

/** Frais de dossier d'un couple (client, bien), le plus récent. */
export async function fraisDossierDuBien(bienId: string, clientId: string): Promise<FraisDossier | undefined> {
  return db.query.fraisDossier.findFirst({ where: and(eq(fraisDossier.bienId, bienId), eq(fraisDossier.clientId, clientId)), orderBy: [desc(fraisDossier.createdAt)] });
}

const montantLisible = (montant: number) => `${Math.round(montant).toLocaleString("fr-FR")} MAD`;

/**
 * Définit ou modifie le montant des frais de dossier d'un bien vendu ou livré
 * (client requis). Refusé dès que le paiement est déclaré ou validé. Le client
 * est notifié à la définition et à chaque modification ; trace au journal.
 */
export async function definirFraisDossier(session: SessionPayload, bienId: string, montant: number): Promise<{ error?: string; modification?: boolean }> {
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== session.promoteurId) return { error: "Bien introuvable." };
  if (!bien.clientId || !["VENDU", "LIVRE"].includes(bien.statut)) return { error: "Les frais de dossier se définissent sur un bien vendu ou livré, avec un client." };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, bien.clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Client introuvable." };

  const existant = await fraisDossierDuBien(bien.id, bien.clientId);
  if (existant && existant.statut !== "A_PAYER") return { error: "Les frais de dossier de ce bien sont déjà payés ou en cours de validation : le montant ne peut plus être modifié." };
  const modification = !!existant;
  const ancien = existant?.montant ?? null;
  if (existant) {
    await db.update(fraisDossier).set({ montant, definiParId: session.userId }).where(eq(fraisDossier.id, existant.id));
  } else {
    await db.insert(fraisDossier).values({ bienId: bien.id, clientId: bien.clientId, montant, statut: "A_PAYER", definiParId: session.userId });
  }

  await notifyClient({
    clientId: bien.clientId,
    type: modification ? "FRAIS_DOSSIER_MODIFIE" : "FRAIS_DOSSIER_A_PAYER",
    titre: modification ? "Montant des frais de dossier modifié" : "Frais de dossier à régler",
    message: modification
      ? `Les frais de dossier de ${bien.designation} passent de ${montantLisible(ancien ?? 0)} à ${montantLisible(montant)}. Déclarez votre paiement dans la rubrique Frais de dossier.`
      : `Les frais de dossier de ${bien.designation} s'élèvent à ${montantLisible(montant)}. Déclarez votre paiement dans la rubrique Frais de dossier.`,
    lien: `/client/biens/${bien.id}`,
  });
  await enregistrerActivite({
    acteur: session,
    action: modification ? "MODIFICATION" : "CREATION",
    cibleType: "frais-dossier",
    cibleId: bien.id,
    cibleNom: `${client.prenom} ${client.nom} · ${bien.designation}`,
    details: modification ? `Frais de dossier : ${montantLisible(ancien ?? 0)} → ${montantLisible(montant)}` : `Frais de dossier définis : ${montantLisible(montant)}`,
  });
  return { modification };
}

/**
 * Validation par le Comptable Interne du paiement déclaré par le client :
 * stockage vérifié d'abord (jamais une ligne validée sans reçu), mise à jour
 * conditionnelle (garde contre une double validation), reçu PDF, notifications
 * au client (validation, reçu disponible), journal.
 */
export async function validerFraisDossier(session: SessionPayload, fraisId: string): Promise<{ error?: string; recuPdfUrl?: string }> {
  const frais = await db.query.fraisDossier.findFirst({ where: eq(fraisDossier.id, fraisId) });
  if (!frais) return { error: "Frais de dossier introuvables." };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, frais.clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Accès refusé." };
  if (frais.statut !== "EN_ATTENTE_VALIDATION") return { error: "Ce paiement n'est pas en attente de validation." };
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, frais.bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet) return { error: "Bien introuvable." };

  await exigerStockageInscriptible();
  const [valide] = await db
    .update(fraisDossier)
    .set({ statut: "PAYE", valideParId: session.userId, validatedAt: new Date() })
    .where(and(eq(fraisDossier.id, fraisId), eq(fraisDossier.statut, "EN_ATTENTE_VALIDATION")))
    .returning();
  if (!valide) return { error: "Ce paiement vient d'être validé par ailleurs." };

  const promoteur = await chargerPromoteur(projet.promoteurId);
  const comptable = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  const recuPdfUrl = await genererEtStockerRecuFraisDossier(valide, bien, client, { projet, promoteur, validePar: comptable ? `${comptable.prenom} ${comptable.nom}` : undefined });
  await db.update(fraisDossier).set({ recuPdfUrl }).where(eq(fraisDossier.id, fraisId));

  await notifyClient({
    clientId: client.id,
    type: "FRAIS_DOSSIER_VALIDE",
    titre: "Paiement des frais de dossier validé",
    message: `Votre paiement des frais de dossier (${montantLisible(frais.montant)}) pour ${bien.designation} a été validé. Votre reçu est disponible.`,
    lien: `/client/biens/${bien.id}`,
  });
  await notifyClient({
    clientId: client.id,
    type: "RECU_DISPONIBLE",
    titre: "Reçu disponible",
    message: `Le reçu de vos frais de dossier (${montantLisible(frais.montant)}) est disponible dans votre espace.`,
    lien: recuPdfUrl,
  });
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "frais-dossier",
    cibleId: bien.id,
    cibleNom: `${client.prenom} ${client.nom} · ${bien.designation}`,
    details: `Paiement des frais de dossier validé (${montantLisible(frais.montant)}), reçu généré`,
  });
  return { recuPdfUrl };
}

/** Frais en attente de validation chez le promoteur (index des paiements du Comptable Interne). */
export async function fraisDossierEnAttente(promoteurId: string): Promise<FraisDossier[]> {
  const liste = await db.query.fraisDossier.findMany({ where: eq(fraisDossier.statut, "EN_ATTENTE_VALIDATION"), orderBy: [desc(fraisDossier.payeAt)] });
  const clientsDuPromoteur = new Set((await db.query.clients.findMany({ where: eq(clients.promoteurId, promoteurId) })).map((c) => c.id));
  return liste.filter((f) => clientsDuPromoteur.has(f.clientId));
}
