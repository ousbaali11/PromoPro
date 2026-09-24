"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { biens, clients, propositions, echeances, users, contrats, projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";
import { notify, notifyMany } from "@/lib/notifications";
import { verifierTexte, LONGUEURS } from "@/lib/validation";
import { lireTranchesProposition, montantTranche, verifierNouvelEcheancier } from "@/lib/echeancier";

export async function createProposition(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);

  const bienId = String(formData.get("bienId") ?? "");
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien || bien.statut !== "DISPONIBLE") {
    return { error: "Ce bien n'est plus disponible pour une proposition." };
  }
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (!projet || projet.promoteurId !== session.promoteurId) return { error: "Bien introuvable." };

  // --- Échéancier libre (1 à 24 tranches) : lu et vérifié AVANT toute écriture (total 100 %, dates non passées) ---
  const tranches = lireTranchesProposition(formData);
  const erreurEcheancier = verifierNouvelEcheancier(tranches);
  if (erreurEcheancier) return { error: erreurEcheancier };

  // --- Client : sélection d'un client existant, ou création d'un nouveau ---
  let clientId = String(formData.get("clientId") ?? "");
  if (clientId && clientId !== "__nouveau__") {
    const existant = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
    if (!existant || existant.promoteurId !== session.promoteurId) return { error: "Client introuvable." };
  }
  if (clientId === "__nouveau__") {
    const nom = String(formData.get("clientNom") ?? "").trim();
    const prenom = String(formData.get("clientPrenom") ?? "").trim();
    const telephone1 = String(formData.get("clientTelephone1") ?? "").trim();
    const email = String(formData.get("clientEmail") ?? "").trim();
    const pieceNumero = String(formData.get("clientPiece") ?? "").trim();

    if (!nom || !prenom || !telephone1 || !email) {
      return { error: "Merci de compléter les informations du nouveau client (nom, prénom, téléphone, e-mail)." };
    }
    const tropLong =
      verifierTexte(nom, { libelle: "Le nom", max: LONGUEURS.nom }) ??
      verifierTexte(prenom, { libelle: "Le prénom", max: LONGUEURS.nom }) ??
      verifierTexte(telephone1, { libelle: "Le téléphone", max: LONGUEURS.courte }) ??
      verifierTexte(email, { libelle: "L'e-mail", max: LONGUEURS.courte }) ??
      verifierTexte(pieceNumero, { libelle: "Le numéro de pièce", max: LONGUEURS.courte });
    if (tropLong) return { error: tropLong };

    const identifiant = generateIdentifiant("CL");
    const tempPassword = generateTempPassword();
    const [client] = await db
      .insert(clients)
      .values({
        promoteurId: session.promoteurId!,
        nom,
        prenom,
        telephone1,
        email,
        pieceNumero,
        identifiant,
        passwordHash: await hashPassword(tempPassword),
        commercialId: session.userId,
      })
      .returning();
    clientId = client.id;
  }

  if (!clientId) return { error: "Merci de sélectionner ou créer un client." };

  // --- Réservation atomique du bien : DISPONIBLE → PROPOSITION_EN_COURS en une seule instruction conditionnelle.
  // Deux envois quasi simultanés sur le même bien : un seul passe, l'autre reçoit un message clair.
  const [reserve] = await db
    .update(biens)
    .set({ statut: "PROPOSITION_EN_COURS", commercialId: session.userId })
    .where(and(eq(biens.id, bienId), eq(biens.statut, "DISPONIBLE")))
    .returning({ id: biens.id });
  if (!reserve) return { error: "Ce bien n'est plus disponible : une autre proposition vient d'être envoyée." };

  // --- Échéancier (libre, défaut 40/20/20/20 dans le formulaire) ---
  const [proposition] = await db
    .insert(propositions)
    .values({ bienId, commercialId: session.userId, clientId, statut: "ENVOYEE" })
    .returning();

  for (const [i, t] of tranches.entries()) {
    await db.insert(echeances).values({
      propositionId: proposition.id,
      bienId,
      numero: i + 1,
      pourcentage: t.pourcentage,
      montant: montantTranche(bien.prix, t.pourcentage),
      dateEcheance: new Date(t.date),
    });
  }

  const pdgList = await db.query.users.findMany({
    where: and(eq(users.promoteurId, session.promoteurId!), eq(users.role, "PDG")),
  });
  await notifyMany(
    pdgList.map((p) => p.id),
    {
      type: "PROPOSITION",
      titre: "Nouvelle proposition de vente",
      message: `${session.prenom} ${session.nom} propose ${bien.designation}.`,
      lien: "/dashboard/propositions",
    },
  );

  revalidatePath("/dashboard/propositions");
  revalidatePath(`/dashboard/biens/${bienId}`);
  redirect("/dashboard/propositions");
}

export type DecisionState = { error?: string } | undefined;

const DEJA_TRAITEE = "Cette proposition a déjà été traitée.";

/** Charge une proposition du promoteur de la session (le PDG ne décide que pour son promoteur) ; erreur en valeur, jamais en exception. */
async function chargerProposition(propositionId: string, promoteurId: string | null) {
  const proposition = await db.query.propositions.findFirst({ where: eq(propositions.id, propositionId) });
  if (!proposition) return { error: "Proposition introuvable." as const };
  const commercial = await db.query.users.findFirst({ where: eq(users.id, proposition.commercialId) });
  if (!commercial || commercial.promoteurId !== promoteurId) return { error: "Proposition introuvable." as const };
  if (proposition.statut !== "ENVOYEE") return { error: DEJA_TRAITEE };
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, proposition.bienId) });
  if (!bien) return { error: "Bien introuvable." as const };
  return { proposition, bien };
}

/**
 * Passe la proposition de ENVOYEE au statut voulu en une instruction
 * conditionnelle : un double clic ou un onglet obsolète ne peut pas décider
 * deux fois (la seconde tentative reçoit « déjà traitée »).
 */
async function decider(propositionId: string, valeurs: { statut: string; decidedAt?: Date; noteNegociation?: string }) {
  const [ok] = await db
    .update(propositions)
    .set(valeurs)
    .where(and(eq(propositions.id, propositionId), eq(propositions.statut, "ENVOYEE")))
    .returning({ id: propositions.id });
  return !!ok;
}

export async function acceptProposition(propositionId: string): Promise<DecisionState> {
  const session = await requireRole(["PDG"]);
  const r = await chargerProposition(propositionId, session.promoteurId);
  if ("error" in r) return { error: r.error };
  const { proposition, bien } = r;

  if (!(await decider(propositionId, { statut: "ACCEPTEE", decidedAt: new Date() }))) return { error: DEJA_TRAITEE };
  // Le bien doit encore être réservé par cette proposition (pas désisté ni libéré entre-temps)
  const [vendu] = await db
    .update(biens)
    .set({ statut: "VENDU", clientId: proposition.clientId })
    .where(and(eq(biens.id, bien.id), eq(biens.statut, "PROPOSITION_EN_COURS")))
    .returning({ id: biens.id });
  if (!vendu) {
    await db.update(propositions).set({ statut: "ENVOYEE", decidedAt: null }).where(eq(propositions.id, propositionId));
    return { error: "Le bien n'est plus réservé par cette proposition : décision annulée." };
  }

  // Le commercial concerné reçoit "Affaire concrétisée"
  await notify({
    userId: proposition.commercialId,
    type: "AFFAIRE_CONCRETISEE",
    titre: "Affaire concrétisée",
    message: `Votre vente de ${bien.designation} a été validée par le PDG.`,
    lien: `/dashboard/biens/${bien.id}`,
  });

  // Les autres commerciaux sont informés que le bien n'est plus disponible
  const autresCommerciaux = await db.query.users.findMany({
    where: and(eq(users.promoteurId, session.promoteurId!)),
  });
  const destinataires = autresCommerciaux
    .filter((u) => ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(u.role) && u.id !== proposition.commercialId)
    .map((u) => u.id);
  await notifyMany(destinataires, {
    type: "BIEN_VENDU",
    titre: "Bien vendu",
    message: `${bien.designation} vient d'être vendu et n'est plus disponible.`,
    lien: `/dashboard/biens/${bien.id}`,
  });

  // Dossier de contrat (statut "En attente" tant qu'il n'est pas complété)
  await db.insert(contrats).values({ bienId: bien.id, clientId: proposition.clientId, statut: "EN_ATTENTE" });

  // Ordre de génération de contrat au Responsable Administratif
  const respAdmins = await db.query.users.findMany({
    where: and(eq(users.promoteurId, session.promoteurId!), eq(users.role, "RESPONSABLE_ADMINISTRATIF")),
  });
  await notifyMany(
    respAdmins.map((r) => r.id),
    {
      type: "CONTRAT_A_GENERER",
      titre: "Contrat à générer",
      message: `${bien.designation} vendu — le contrat peut être préparé.`,
      lien: "/dashboard/contrats",
    },
  );

  revalidatePath("/dashboard/propositions");
  revalidatePath(`/dashboard/biens/${bien.id}`);
  return undefined;
}

export async function refuseProposition(propositionId: string): Promise<DecisionState> {
  const session = await requireRole(["PDG"]);
  const r = await chargerProposition(propositionId, session.promoteurId);
  if ("error" in r) return { error: r.error };
  const { proposition, bien } = r;

  if (!(await decider(propositionId, { statut: "REFUSEE", decidedAt: new Date() }))) return { error: DEJA_TRAITEE };
  await db
    .update(biens)
    .set({ statut: "DISPONIBLE", commercialId: null })
    .where(and(eq(biens.id, bien.id), eq(biens.statut, "PROPOSITION_EN_COURS")));

  await notify({
    userId: proposition.commercialId,
    type: "PROPOSITION_REFUSEE",
    titre: "Proposition refusée",
    message: `Le PDG a refusé votre proposition pour ${bien.designation}.`,
    lien: `/dashboard/biens/${bien.id}`,
  });

  revalidatePath("/dashboard/propositions");
  revalidatePath(`/dashboard/biens/${bien.id}`);
  return undefined;
}

export async function negotiateProposition(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["PDG"]);
  const propositionId = String(formData.get("propositionId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Merci de préciser votre contre-proposition." };
  const tropLong = verifierTexte(note, { libelle: "La contre-proposition", max: LONGUEURS.moyenne });
  if (tropLong) return { error: tropLong };

  const r = await chargerProposition(propositionId, session.promoteurId);
  if ("error" in r) return { error: r.error };
  const { proposition, bien } = r;

  if (!(await decider(propositionId, { statut: "NEGOCIEE", noteNegociation: note }))) return { error: DEJA_TRAITEE };

  await notify({
    userId: proposition.commercialId,
    type: "PROPOSITION_NEGOCIEE",
    titre: "Contre-proposition du PDG",
    message: note,
    lien: `/dashboard/biens/${bien.id}`,
  });

  revalidatePath("/dashboard/propositions");
  return { error: undefined };
}
