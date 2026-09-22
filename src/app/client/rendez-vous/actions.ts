"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { rendezvous, biens, users } from "@/db/schema";
import { requireClientSession } from "@/lib/session";
import { notify, notifyRole } from "@/lib/notifications";
import { SERVICES, SERVICE_LABEL, type Service } from "@/lib/creneaux";
import { formatDateTime } from "@/lib/utils";

export type RdvState = { error?: string; success?: string } | undefined;

const PAGES = ["/client/rendez-vous", "/dashboard", "/dashboard/sav", "/dashboard/recouvrement", "/dashboard/contrats"];

/** Prévient le service concerné (11.5) : le commercial du bien, ou tous les utilisateurs du rôle. */
async function notifierService(
  service: Service,
  promoteurId: string,
  bien: typeof biens.$inferSelect | null,
  params: { type: string; titre: string; message: string },
) {
  const lien = { COMMERCIAL: "/dashboard", SAV: "/dashboard/sav", ADMINISTRATIF: "/dashboard/contrats", RECOUVREMENT: "/dashboard/recouvrement" }[service];
  if (service === "COMMERCIAL") {
    const commercialId = bien?.commercialId;
    if (commercialId) await notify({ userId: commercialId, lien, ...params });
    else await notifyRole(promoteurId, ["RESPONSABLE_COMMERCIAL"], { lien, ...params });
    return;
  }
  const role = { SAV: "SERVICE_APRES_VENTE", ADMINISTRATIF: "RESPONSABLE_ADMINISTRATIF", RECOUVREMENT: "RECOUVREMENT" }[service] as
    | "SERVICE_APRES_VENTE"
    | "RESPONSABLE_ADMINISTRATIF"
    | "RECOUVREMENT";
  await notifyRole(promoteurId, role, { lien, ...params });
}

/** Le client propose un rendez-vous à un service, pour un de ses biens. */
export async function proposerRendezVous(_prev: RdvState, formData: FormData): Promise<RdvState> {
  const session = await requireClientSession();
  const service = String(formData.get("service") ?? "") as Service;
  const bienId = String(formData.get("bienId") ?? "");
  const date = new Date(String(formData.get("date") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!SERVICES.some((s) => s.value === service)) return { error: "Merci de choisir un service." };
  if (Number.isNaN(date.getTime())) return { error: "Merci d'indiquer une date et une heure." };
  if (date.getTime() < Date.now()) return { error: "La date proposée est déjà passée." };

  const bien = bienId ? ((await db.query.biens.findFirst({ where: eq(biens.id, bienId) })) ?? null) : null;
  if (bienId && (!bien || bien.clientId !== session.clientId)) return { error: "Bien introuvable." };

  await db.insert(rendezvous).values({
    clientId: session.clientId,
    bienId: bien?.id ?? null,
    service,
    dateProposee: date,
    statut: "PROPOSE",
    dernierAuteur: "CLIENT",
    notes: notes || null,
  });

  await notifierService(service, session.promoteurId, bien, {
    type: "RDV_PROPOSE",
    titre: "Nouvelle demande de rendez-vous",
    message: `${session.prenom} ${session.nom} propose le ${formatDateTime(date)}${bien ? ` (${bien.designation})` : ""}.`,
  });

  PAGES.forEach((p) => revalidatePath(p));
  return { success: `Demande envoyée au ${SERVICE_LABEL[service].toLowerCase()}. Vous serez notifié de sa réponse.` };
}

async function monRdv(rdvId: string) {
  const session = await requireClientSession();
  const rdv = await db.query.rendezvous.findFirst({ where: eq(rendezvous.id, rdvId) });
  if (!rdv || rdv.clientId !== session.clientId) return { error: "Rendez-vous introuvable." as const };
  if (rdv.statut === "ACCEPTE" || rdv.dernierAuteur !== "SERVICE") {
    return { error: "Ce rendez-vous n'est pas en attente de votre réponse." as const };
  }
  return { session, rdv };
}

/** Le client accepte la contre-proposition du service. */
export async function accepterPropositionService(rdvId: string): Promise<{ error?: string } | undefined> {
  const r = await monRdv(rdvId);
  if ("error" in r) return { error: r.error };
  const { session, rdv } = r;

  await db.update(rendezvous).set({ statut: "ACCEPTE", dernierAuteur: "CLIENT" }).where(eq(rendezvous.id, rdvId));

  const bien = rdv.bienId ? ((await db.query.biens.findFirst({ where: eq(biens.id, rdv.bienId) })) ?? null) : null;
  const traitePar = rdv.traiteParId ? await db.query.users.findFirst({ where: eq(users.id, rdv.traiteParId) }) : null;
  const params = {
    type: "RDV_ACCEPTE_CLIENT",
    titre: "Rendez-vous confirmé par le client",
    message: `${session.prenom} ${session.nom} a accepté le rendez-vous du ${formatDateTime(rdv.dateProposee)}.`,
  };
  if (traitePar) await notify({ userId: traitePar.id, lien: "/dashboard", ...params });
  else await notifierService(rdv.service as Service, session.promoteurId, bien, params);

  PAGES.forEach((p) => revalidatePath(p));
  return undefined;
}

/** Le client repropose une autre date après une contre-proposition du service. */
export async function reproposerClient(
  rdvId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const r = await monRdv(rdvId);
  if ("error" in r) return { error: r.error };
  const { session, rdv } = r;

  const date = new Date(String(formData.get("date") ?? ""));
  if (Number.isNaN(date.getTime())) return { error: "Merci d'indiquer une date et une heure." };
  if (date.getTime() < Date.now()) return { error: "La date proposée est déjà passée." };

  await db
    .update(rendezvous)
    .set({ statut: "REPROPOSE", dateProposee: date, dernierAuteur: "CLIENT" })
    .where(eq(rendezvous.id, rdvId));

  const bien = rdv.bienId ? ((await db.query.biens.findFirst({ where: eq(biens.id, rdv.bienId) })) ?? null) : null;
  await notifierService(rdv.service as Service, session.promoteurId, bien, {
    type: "RDV_REPROPOSE_CLIENT",
    titre: "Le client repropose un rendez-vous",
    message: `${session.prenom} ${session.nom} propose le ${formatDateTime(date)}.`,
  });

  PAGES.forEach((p) => revalidatePath(p));
  return undefined;
}
