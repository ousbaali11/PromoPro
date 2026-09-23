"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { requireRole, requireStaffSession } from "@/lib/session";
import { hashPassword, generateIdentifiant, generateTempPassword } from "@/lib/auth";
import { parsePublicPath } from "@/lib/storage";
import { enregistrerActivite, decrireChangements } from "@/lib/journal";
import { peutModifierClient, etatCompte } from "@/lib/comptes";
import { redirect } from "next/navigation";

export type CreateClientState = { error?: string; success?: { identifiant: string; password: string } } | undefined;

export async function createClient(_prev: CreateClientState, formData: FormData): Promise<CreateClientState> {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL", "DIRECTEUR_COMMERCIAL"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const telephone1 = String(formData.get("telephone1") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!nom || !prenom || !telephone1 || !email) {
    return { error: "Nom, prénom, téléphone et e-mail sont obligatoires." };
  }

  // Chemin retourné par POST /api/upload (composant FileUpload) — on ne garde
  // que les chemins bien formés, jamais une valeur arbitraire.
  const pieceDocUrl = String(formData.get("pieceDocUrl") ?? "");
  if (pieceDocUrl && !parsePublicPath(pieceDocUrl)) {
    return { error: "Le document d'identité importé est invalide, merci de le réimporter." };
  }

  const identifiant = generateIdentifiant("CL");
  const password = generateTempPassword();

  const [cree] = await db.insert(clients).values({
    promoteurId: session.promoteurId!,
    nom,
    prenom,
    dateNaissance: String(formData.get("dateNaissance") ?? "") || null,
    lieuNaissance: String(formData.get("lieuNaissance") ?? "") || null,
    adresse: String(formData.get("adresse") ?? "") || null,
    pieceType: String(formData.get("pieceType") ?? "CIN"),
    pieceNumero: String(formData.get("pieceNumero") ?? "") || null,
    pieceDocUrl: pieceDocUrl || null,
    telephone1,
    telephone2: String(formData.get("telephone2") ?? "") || null,
    email,
    identifiant,
    passwordHash: await hashPassword(password),
    commercialId: session.userId,
  }).returning();
  await enregistrerActivite({
    acteur: session,
    action: "CREATION",
    cibleType: "client",
    cibleId: cree.id,
    cibleNom: `${prenom} ${nom}`,
    details: `Identifiant ${identifiant} · e-mail ${email}`,
  });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/journal");
  return { success: { identifiant, password } };
}

/** Le commercial réinitialise le mot de passe d'un de ses clients (identifiant inchangé). */
export async function resetClientPassword(clientId: string): Promise<{ password: string } | { error: string }> {
  const session = await requireStaffSession();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Client introuvable." };

  const password = generateTempPassword();
  await db.update(clients).set({ passwordHash: await hashPassword(password) }).where(eq(clients.id, clientId));
  revalidatePath("/dashboard/clients");
  return { password };
}

export type ModifClientState = { error?: string } | undefined;

const LIBELLES_CLIENT = {
  nom: "Nom",
  prenom: "Prénom",
  dateNaissance: "Date de naissance",
  lieuNaissance: "Lieu de naissance",
  adresse: "Adresse",
  pieceType: "Type de pièce",
  pieceNumero: "Numéro de pièce",
  pieceDocUrl: "Scan de la pièce",
  telephone1: "Téléphone 1",
  telephone2: "Téléphone 2",
  email: "E-mail",
} as const;

/** Le commercial qui gère le client, ou tout membre du pôle commercial, corrige ses informations. */
export async function modifierClient(_prev: ModifClientState, formData: FormData): Promise<ModifClientState> {
  const session = await requireStaffSession();
  const clientId = String(formData.get("clientId") ?? "");
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Client introuvable." };
  if (!peutModifierClient(session, client)) return { error: "Vous n'êtes pas autorisé à modifier ce client." };
  if (etatCompte(client) !== "actif") return { error: "Réactivez d'abord ce compte pour le modifier." };

  const champ = (n: string) => String(formData.get(n) ?? "").trim();
  const pieceDocUrl = champ("pieceDocUrl");
  if (pieceDocUrl && !parsePublicPath(pieceDocUrl)) {
    return { error: "Le document d'identité importé est invalide, merci de le réimporter." };
  }
  const apres = {
    nom: champ("nom"),
    prenom: champ("prenom"),
    dateNaissance: champ("dateNaissance") || null,
    lieuNaissance: champ("lieuNaissance") || null,
    adresse: champ("adresse") || null,
    pieceType: champ("pieceType") || "CIN",
    pieceNumero: champ("pieceNumero") || null,
    pieceDocUrl: pieceDocUrl || client.pieceDocUrl,
    telephone1: champ("telephone1"),
    telephone2: champ("telephone2") || null,
    email: champ("email"),
  };
  if (!apres.nom || !apres.prenom || !apres.telephone1 || !apres.email) {
    return { error: "Nom, prénom, téléphone et e-mail sont obligatoires." };
  }
  const details = decrireChangements(client, apres, LIBELLES_CLIENT);
  if (!details) return { error: "Aucune modification à enregistrer." };

  await db.update(clients).set(apres).where(eq(clients.id, clientId));
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "client",
    cibleId: clientId,
    cibleNom: `${apres.prenom} ${apres.nom}`,
    details,
  });

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/journal");
  redirect(`/dashboard/clients/${clientId}`);
}
