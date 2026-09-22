"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { biens, clients, projets, promoteurs, visites } from "@/db/schema";
import { requireClientSession } from "@/lib/session";
import { creerPaiement, lirePaiementForm, notifierComptable } from "@/lib/paiements";
import { notifyRole } from "@/lib/notifications";
import { estCreneauValide, CRENEAUX_LIBELLE } from "@/lib/creneaux";
import { genererEtStockerAutorisationVisite } from "@/lib/pdf/autorisation-visite";
import { formatDateTime } from "@/lib/utils";
import type { PaiementFormState } from "@/components/paiements/PaiementForm";

/**
 * Section 11.8 / 11.9 — le client déclare lui-même un règlement (tranche
 * suivante, versement complémentaire d'une tranche fractionnée...). La ligne
 * part "En attente comptable" et le Comptable Interne est notifié.
 */
export async function ajouterPaiementClient(_prev: PaiementFormState, formData: FormData): Promise<PaiementFormState> {
  const session = await requireClientSession();
  const lu = lirePaiementForm(formData);
  if ("error" in lu) return { error: lu.error };
  if (!lu.data.preuveUrl) return { error: "Merci de joindre la preuve de paiement." };

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, lu.data.bienId) });
  if (!bien || bien.clientId !== session.clientId) return { error: "Bien introuvable." };

  const res = await creerPaiement(lu.data, { clientId: session.clientId });
  if ("error" in res) return { error: res.error };

  await notifierComptable(session.promoteurId, bien, `Le client ${session.prenom} ${session.nom}`);

  revalidatePath(`/client/biens/${bien.id}`);
  revalidatePath("/dashboard/paiements");
  return { success: "Paiement déclaré. Il sera vérifié par le service comptable ; votre reçu apparaîtra ici une fois validé." };
}

async function monBien(bienId: string) {
  const session = await requireClientSession();
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien || bien.clientId !== session.clientId) return { error: "Bien introuvable." as const };
  return { session, bien };
}

/** Section 11.7 — le client demande à visiter son bien ; le SAV accepte ou refuse. */
export async function demanderVisite(bienId: string): Promise<{ error?: string } | undefined> {
  const r = await monBien(bienId);
  if ("error" in r) return { error: r.error };
  const { session, bien } = r;

  const enCours = await db.query.visites.findFirst({
    where: and(eq(visites.bienId, bien.id), eq(visites.clientId, session.clientId), inArray(visites.statut, ["DEMANDEE", "ACCEPTEE"])),
  });
  if (enCours) return { error: "Une demande de visite est déjà en cours pour ce bien." };

  await db.insert(visites).values({ bienId: bien.id, clientId: session.clientId, statut: "DEMANDEE" });

  await notifyRole(session.promoteurId, "SERVICE_APRES_VENTE", {
    type: "VISITE_DEMANDEE",
    titre: "Demande de visite",
    message: `${session.prenom} ${session.nom} souhaite visiter ${bien.designation}. À accepter ou refuser.`,
    lien: "/dashboard/sav",
  });

  revalidatePath(`/client/biens/${bien.id}`);
  revalidatePath("/dashboard/sav");
  return undefined;
}

/** Une fois la visite acceptée, le client choisit un créneau (validé côté serveur). */
export async function choisirCreneauVisite(
  visiteId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const session = await requireClientSession();
  const visite = await db.query.visites.findFirst({ where: eq(visites.id, visiteId) });
  if (!visite || visite.clientId !== session.clientId) return { error: "Demande introuvable." };
  if (visite.statut !== "ACCEPTEE") return { error: "Cette demande n'est pas en attente de choix de créneau." };

  const dateStr = String(formData.get("date") ?? "");
  const heure = String(formData.get("heure") ?? "");
  const date = new Date(`${dateStr}T${heure}`);
  if (!dateStr || !heure || Number.isNaN(date.getTime())) return { error: "Merci de choisir une date et une heure." };
  if (date.getTime() < Date.now()) return { error: "Ce créneau est déjà passé." };
  if (!estCreneauValide(date)) return { error: `Créneau hors des horaires de visite (${CRENEAUX_LIBELLE}).` };

  const bien = (await db.query.biens.findFirst({ where: eq(biens.id, visite.bienId) }))!;
  const client = (await db.query.clients.findFirst({ where: eq(clients.id, session.clientId) }))!;
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, session.promoteurId) });

  // L'autorisation est régénérée avec le créneau retenu
  const autorisationUrl = await genererEtStockerAutorisationVisite(
    { ...visite, dateVisite: date, statut: "PLANIFIEE" },
    bien,
    client,
    { projet, promoteur },
  );
  await db
    .update(visites)
    .set({ statut: "PLANIFIEE", dateVisite: date, autorisationUrl })
    .where(eq(visites.id, visiteId));

  await notifyRole(session.promoteurId, "SERVICE_APRES_VENTE", {
    type: "VISITE_PLANIFIEE",
    titre: "Visite planifiée",
    message: `${session.prenom} ${session.nom} visitera ${bien.designation} le ${formatDateTime(date)}.`,
    lien: "/dashboard/sav",
  });

  revalidatePath(`/client/biens/${bien.id}`);
  revalidatePath("/dashboard/sav");
  return undefined;
}
