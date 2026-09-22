"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { biens, clients, propositions, echeances, users, contrats } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";
import { notify, notifyMany } from "@/lib/notifications";

export async function createProposition(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);

  const bienId = String(formData.get("bienId") ?? "");
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien || bien.statut !== "DISPONIBLE") {
    return { error: "Ce bien n'est plus disponible pour une proposition." };
  }

  // --- Client : sélection d'un client existant, ou création d'un nouveau ---
  let clientId = String(formData.get("clientId") ?? "");
  if (clientId === "__nouveau__") {
    const nom = String(formData.get("clientNom") ?? "").trim();
    const prenom = String(formData.get("clientPrenom") ?? "").trim();
    const telephone1 = String(formData.get("clientTelephone1") ?? "").trim();
    const email = String(formData.get("clientEmail") ?? "").trim();
    const pieceNumero = String(formData.get("clientPiece") ?? "").trim();

    if (!nom || !prenom || !telephone1 || !email) {
      return { error: "Merci de compléter les informations du nouveau client (nom, prénom, téléphone, e-mail)." };
    }

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

  // --- Échéancier (modifiable par le commercial, défaut 40/20/20/20) ---
  const [proposition] = await db
    .insert(propositions)
    .values({ bienId, commercialId: session.userId, clientId, statut: "ENVOYEE" })
    .returning();

  for (let i = 1; i <= 4; i++) {
    const pourcentage = Number(formData.get(`tranche${i}Pourcentage`));
    const dateStr = String(formData.get(`tranche${i}Date`) ?? "");
    if (!pourcentage || !dateStr) continue;
    await db.insert(echeances).values({
      propositionId: proposition.id,
      bienId,
      numero: i,
      pourcentage,
      montant: Math.round((pourcentage / 100) * bien.prix),
      dateEcheance: new Date(dateStr),
    });
  }

  await db
    .update(biens)
    .set({ statut: "PROPOSITION_EN_COURS", commercialId: session.userId })
    .where(eq(biens.id, bienId));

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

async function getPropositionOrThrow(propositionId: string) {
  const proposition = await db.query.propositions.findFirst({ where: eq(propositions.id, propositionId) });
  if (!proposition) throw new Error("Proposition introuvable.");
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, proposition.bienId) });
  if (!bien) throw new Error("Bien introuvable.");
  return { proposition, bien };
}

export async function acceptProposition(propositionId: string) {
  const session = await requireRole(["PDG"]);
  const { proposition, bien } = await getPropositionOrThrow(propositionId);

  await db
    .update(propositions)
    .set({ statut: "ACCEPTEE", decidedAt: new Date() })
    .where(eq(propositions.id, propositionId));
  await db
    .update(biens)
    .set({ statut: "VENDU", clientId: proposition.clientId })
    .where(eq(biens.id, bien.id));

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
  await db.insert(contrats).values({ bienId: bien.id, statut: "EN_ATTENTE" });

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
}

export async function refuseProposition(propositionId: string) {
  await requireRole(["PDG"]);
  const { proposition, bien } = await getPropositionOrThrow(propositionId);

  await db
    .update(propositions)
    .set({ statut: "REFUSEE", decidedAt: new Date() })
    .where(eq(propositions.id, propositionId));
  await db.update(biens).set({ statut: "DISPONIBLE", commercialId: null }).where(eq(biens.id, bien.id));

  await notify({
    userId: proposition.commercialId,
    type: "PROPOSITION_REFUSEE",
    titre: "Proposition refusée",
    message: `Le PDG a refusé votre proposition pour ${bien.designation}.`,
    lien: `/dashboard/biens/${bien.id}`,
  });

  revalidatePath("/dashboard/propositions");
  revalidatePath(`/dashboard/biens/${bien.id}`);
}

export async function negotiateProposition(_prev: { error?: string } | undefined, formData: FormData) {
  await requireRole(["PDG"]);
  const propositionId = String(formData.get("propositionId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Merci de préciser votre contre-proposition." };

  const { proposition, bien } = await getPropositionOrThrow(propositionId);

  await db
    .update(propositions)
    .set({ statut: "NEGOCIEE", noteNegociation: note })
    .where(eq(propositions.id, propositionId));

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
