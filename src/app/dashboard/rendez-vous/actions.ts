"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { rendezvous, biens, clients } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";
import { notifyClient } from "@/lib/notifications";
import { SERVICE_LABEL, SERVICE_ROLES, type Service } from "@/lib/creneaux";
import { formatDateTime } from "@/lib/utils";

const PAGES = ["/dashboard", "/dashboard/sav", "/dashboard/recouvrement", "/dashboard/contrats", "/client/rendez-vous"];

/** Charge le rendez-vous et vérifie que la session appartient bien au service concerné. */
async function rdvPourSession(rdvId: string) {
  const session = await requireStaffSession();
  const rdv = await db.query.rendezvous.findFirst({ where: eq(rendezvous.id, rdvId) });
  if (!rdv) return { error: "Rendez-vous introuvable." as const };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, rdv.clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Accès refusé." as const };

  const roles = SERVICE_ROLES[rdv.service as Service] ?? [];
  if (!roles.includes(session.role)) return { error: "Ce rendez-vous ne concerne pas votre service." as const };
  if (rdv.service === "COMMERCIAL" && session.role === "COMMERCIAL") {
    const bien = rdv.bienId ? await db.query.biens.findFirst({ where: eq(biens.id, rdv.bienId) }) : null;
    const commercialId = bien?.commercialId ?? client.commercialId;
    if (commercialId !== session.userId) return { error: "Ce rendez-vous concerne un autre commercial." as const };
  }
  if (rdv.dernierAuteur !== "CLIENT" || rdv.statut === "ACCEPTE") {
    return { error: "Ce rendez-vous n'est pas en attente de votre réponse." as const };
  }
  return { session, rdv, client };
}

export async function accepterRendezVous(rdvId: string): Promise<{ error?: string } | undefined> {
  const r = await rdvPourSession(rdvId);
  if ("error" in r) return { error: r.error };
  const { session, rdv, client } = r;

  await db
    .update(rendezvous)
    .set({ statut: "ACCEPTE", dernierAuteur: "SERVICE", traiteParId: session.userId })
    .where(eq(rendezvous.id, rdvId));

  await notifyClient({
    clientId: client.id,
    type: "RDV_ACCEPTE",
    titre: "Rendez-vous confirmé",
    message: `${SERVICE_LABEL[rdv.service]} : rendez-vous confirmé le ${formatDateTime(rdv.dateProposee)}.`,
    lien: "/client/rendez-vous",
  });
  PAGES.forEach((p) => revalidatePath(p));
  return undefined;
}

export async function reproposerRendezVous(
  rdvId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const r = await rdvPourSession(rdvId);
  if ("error" in r) return { error: r.error };
  const { session, rdv, client } = r;

  const date = new Date(String(formData.get("date") ?? ""));
  if (Number.isNaN(date.getTime())) return { error: "Merci d'indiquer une date et une heure." };
  if (date.getTime() < Date.now()) return { error: "La date proposée est déjà passée." };
  const notes = String(formData.get("notes") ?? "").trim();

  await db
    .update(rendezvous)
    .set({ statut: "REPROPOSE", dateProposee: date, dernierAuteur: "SERVICE", traiteParId: session.userId, notes: notes || rdv.notes })
    .where(eq(rendezvous.id, rdvId));

  await notifyClient({
    clientId: client.id,
    type: "RDV_REPROPOSE",
    titre: "Nouvelle proposition de rendez-vous",
    message: `${SERVICE_LABEL[rdv.service]} vous propose le ${formatDateTime(date)}${notes ? ` — ${notes}` : ""}. À accepter ou reproposer.`,
    lien: "/client/rendez-vous",
  });
  PAGES.forEach((p) => revalidatePath(p));
  return undefined;
}
