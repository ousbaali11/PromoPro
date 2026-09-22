"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { visites, biens, clients, projets, promoteurs } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { notifyClient } from "@/lib/notifications";
import { genererEtStockerAutorisationVisite } from "@/lib/pdf/autorisation-visite";

async function visitePourSession(visiteId: string) {
  const session = await requireRole(["SERVICE_APRES_VENTE"]);
  const visite = await db.query.visites.findFirst({ where: eq(visites.id, visiteId) });
  if (!visite) return { error: "Demande introuvable." as const };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, visite.clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Accès refusé." as const };
  if (visite.statut !== "DEMANDEE") return { error: "Cette demande a déjà été traitée." as const };
  const bien = (await db.query.biens.findFirst({ where: eq(biens.id, visite.bienId) }))!;
  return { session, visite, client, bien };
}

/** Section 12.3 — le SAV accepte la visite : autorisation PDF générée, client notifié pour choisir un créneau. */
export async function accepterVisite(visiteId: string): Promise<{ error?: string } | undefined> {
  const r = await visitePourSession(visiteId);
  if ("error" in r) return { error: r.error };
  const { session, visite, client, bien } = r;

  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, session.promoteurId!) });
  const decidedAt = new Date();
  const autorisationUrl = await genererEtStockerAutorisationVisite(
    { ...visite, statut: "ACCEPTEE", decidedAt },
    bien,
    client,
    { projet, promoteur, savNom: `${session.prenom} ${session.nom}` },
  );

  await db
    .update(visites)
    .set({ statut: "ACCEPTEE", autorisationUrl, traiteParId: session.userId, decidedAt })
    .where(eq(visites.id, visiteId));

  await notifyClient({
    clientId: client.id,
    type: "VISITE_ACCEPTEE",
    titre: "Visite acceptée",
    message: `Votre autorisation de visite pour ${bien.designation} est disponible. Choisissez votre créneau dans votre espace.`,
    lien: `/client/biens/${bien.id}`,
  });

  revalidatePath("/dashboard/sav");
  revalidatePath(`/client/biens/${bien.id}`);
  return undefined;
}

export async function refuserVisite(
  visiteId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const r = await visitePourSession(visiteId);
  if ("error" in r) return { error: r.error };
  const { session, client, bien } = r;
  const motif = String(formData.get("motif") ?? "").trim();

  await db
    .update(visites)
    .set({ statut: "REFUSEE", motifRefus: motif || null, traiteParId: session.userId, decidedAt: new Date() })
    .where(eq(visites.id, visiteId));

  await notifyClient({
    clientId: client.id,
    type: "VISITE_REFUSEE",
    titre: "Demande de visite refusée",
    message: `Votre demande de visite de ${bien.designation} n'a pas pu être acceptée${motif ? ` : ${motif}` : "."}`,
    lien: `/client/biens/${bien.id}`,
  });

  revalidatePath("/dashboard/sav");
  revalidatePath(`/client/biens/${bien.id}`);
  return undefined;
}
