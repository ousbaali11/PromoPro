"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { visites, biens, clients, projets, promoteurs, demandesPhotos, photosAvancement, syndics, demandesTma } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { notifyClient } from "@/lib/notifications";
import { finaliserLivraisonSiComplete } from "@/lib/livraison";
import { genererEtStockerAutorisationVisite } from "@/lib/pdf/autorisation-visite";
import { parsePublicPath } from "@/lib/storage";
import { enregistrerActivite } from "@/lib/journal";
import { demandeTmaAvecBien } from "@/lib/tma-data";
import { prochainStatutTma, TMA_LABELS } from "@/lib/tma";
import { formatMoney } from "@/lib/utils";
import { lireNombre, verifierMontant, verifierTexte, LONGUEURS } from "@/lib/validation";

/** Section 12.4 — le SAV dépose les photos d'avancement demandées ; elles deviennent visibles côté client. */
export async function deposerPhotos(
  demandeId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const session = await requireRole(["SERVICE_APRES_VENTE"]);
  const demande = await db.query.demandesPhotos.findFirst({ where: eq(demandesPhotos.id, demandeId) });
  if (!demande) return { error: "Demande introuvable." };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, demande.clientId) });
  if (!client || client.promoteurId !== session.promoteurId) return { error: "Accès refusé." };

  const urls = formData.getAll("photos").map(String).filter(Boolean);
  if (urls.length === 0) return { error: "Merci d'ajouter au moins une photo." };
  if (urls.some((u) => !parsePublicPath(u))) return { error: "Un des fichiers importés est invalide." };
  const legende = String(formData.get("legende") ?? "").trim() || null;

  await db.insert(photosAvancement).values(
    urls.map((url) => ({ demandeId: demande.id, bienId: demande.bienId, url, legende, deposeParId: session.userId })),
  );
  await db
    .update(demandesPhotos)
    .set({ statut: "TRAITEE", traiteParId: session.userId, traiteAt: new Date() })
    .where(eq(demandesPhotos.id, demandeId));

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, demande.bienId) });
  await notifyClient({
    clientId: client.id,
    type: "PHOTOS_DISPONIBLES",
    titre: "Photos d'avancement disponibles",
    message: `${urls.length} photo${urls.length > 1 ? "s" : ""} de ${bien?.designation ?? "votre bien"} ${urls.length > 1 ? "ont" : "a"} été déposée${urls.length > 1 ? "s" : ""} par le Service Après-Vente.`,
    lien: `/client/biens/${demande.bienId}`,
  });

  revalidatePath("/dashboard/sav");
  revalidatePath(`/client/biens/${demande.bienId}`);
  return undefined;
}

async function bienDuPromoteur(bienId: string, promoteurId: string) {
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!bien || !projet || projet.promoteurId !== promoteurId) return null;
  return bien;
}

/** Section 12.1 — le SAV confirme de son côté la livraison du bien. */
export async function confirmerLivraisonSav(bienId: string): Promise<{ error?: string } | undefined> {
  const session = await requireRole(["SERVICE_APRES_VENTE"]);
  const bien = await bienDuPromoteur(bienId, session.promoteurId!);
  if (!bien) return { error: "Bien introuvable." };
  if (bien.statut !== "VENDU" || !bien.clientId) return { error: "Ce bien n'est pas en attente de livraison." };
  if (bien.livraisonConfirmeeSav) return undefined;

  await db.update(biens).set({ livraisonConfirmeeSav: true }).where(eq(biens.id, bien.id));
  const livre = await finaliserLivraisonSiComplete(bien.id);
  if (!livre) {
    await notifyClient({
      clientId: bien.clientId,
      type: "LIVRAISON_SAV",
      titre: "Livraison confirmée par le SAV",
      message: `Le Service Après-Vente a confirmé la livraison de ${bien.designation}. Merci de confirmer la réception de votre côté.`,
      lien: `/client/biens/${bien.id}`,
    });
  }

  revalidatePath("/dashboard/sav");
  revalidatePath("/dashboard/contrats");
  revalidatePath(`/client/biens/${bien.id}`);
  revalidatePath(`/dashboard/biens/${bien.id}`);
  return undefined;
}

/** Section 12.2 — le SAV définit le montant de syndic dû par le client d'un bien. */
export async function definirSyndic(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["SERVICE_APRES_VENTE"]);
  const bienId = String(formData.get("bienId") ?? "");
  const montant = lireNombre(formData.get("montant"));
  const periode = String(formData.get("periode") ?? "2 ans");
  const erreurMontant = verifierMontant(montant, { libelle: "Le montant du syndic" });
  if (erreurMontant) return { error: erreurMontant };

  const bien = await bienDuPromoteur(bienId, session.promoteurId!);
  if (!bien || !bien.clientId || !["VENDU", "LIVRE"].includes(bien.statut)) {
    return { error: "Le syndic se définit sur un bien vendu ou livré, avec un client." };
  }
  const existant = await db.query.syndics.findFirst({
    where: and(eq(syndics.bienId, bien.id), eq(syndics.clientId, bien.clientId)),
  });
  if (existant && existant.statut !== "A_PAYER") return { error: "Un syndic est déjà payé ou en cours de validation pour ce bien." };

  if (existant) {
    await db.update(syndics).set({ montant, periode, definiParId: session.userId }).where(eq(syndics.id, existant.id));
  } else {
    await db.insert(syndics).values({ bienId: bien.id, clientId: bien.clientId, montant, periode, statut: "A_PAYER", definiParId: session.userId });
  }

  await notifyClient({
    clientId: bien.clientId,
    type: "SYNDIC_A_PAYER",
    titre: "Montant du syndic à régler",
    message: `Votre part de syndic pour ${bien.designation} s'élève à ${Math.round(montant).toLocaleString("fr-FR")} MAD (${periode}). Déclarez votre paiement dans la rubrique Syndic.`,
    lien: `/client/biens/${bien.id}`,
  });

  revalidatePath("/dashboard/sav");
  revalidatePath(`/client/biens/${bien.id}`);
  return { error: undefined };
}

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

export type TmaSavState = { error?: string; success?: string } | undefined;

async function demandeDuPromoteur(demandeId: string, promoteurId: string | null) {
  const r = await demandeTmaAvecBien(demandeId);
  return r && r.projet.promoteurId === promoteurId ? r : null;
}

/** TMA — le SAV chiffre la demande : montant + devis PDF, le client est notifié. */
export async function chiffrerTma(_prev: TmaSavState, formData: FormData): Promise<TmaSavState> {
  const session = await requireRole(["SERVICE_APRES_VENTE"]);
  const demandeId = String(formData.get("demandeId") ?? "");
  const montant = lireNombre(formData.get("montant"));
  const devisUrl = String(formData.get("devisUrl") ?? "");
  const r = await demandeDuPromoteur(demandeId, session.promoteurId);
  if (!r) return { error: "Demande introuvable." };
  if (r.demande.statut !== "DEMANDE") return { error: "Cette demande a déjà été traitée." };
  const erreurMontant = verifierMontant(montant, { libelle: "Le montant du devis" });
  if (erreurMontant) return { error: erreurMontant };
  if (parsePublicPath(devisUrl)?.type !== "tma-devis") return { error: "Joignez le devis (PDF)." };

  await db.update(demandesTma).set({ statut: "CHIFFRE", montant, devisUrl, chiffreParId: session.userId }).where(eq(demandesTma.id, demandeId));
  await notifyClient({
    clientId: r.demande.clientId,
    type: "TMA_DEVIS",
    titre: "Devis de modification disponible",
    message: `${r.bien.designation} : devis de ${formatMoney(montant)} à accepter dans votre espace.`,
    lien: `/client/biens/${r.bien.id}`,
  });
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "tma",
    cibleId: demandeId,
    cibleNom: `${r.bien.designation} — demande de modification`,
    details: `Chiffrée : ${formatMoney(montant)}, devis envoyé au client`,
  });
  revalidatePath("/dashboard/sav");
  revalidatePath(`/client/biens/${r.bien.id}`);
  return { success: "Devis envoyé au client." };
}

/** TMA — le SAV refuse une demande (irréalisable, hors délai…) avec un motif. */
export async function refuserTma(_prev: TmaSavState, formData: FormData): Promise<TmaSavState> {
  const session = await requireRole(["SERVICE_APRES_VENTE"]);
  const demandeId = String(formData.get("demandeId") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  const r = await demandeDuPromoteur(demandeId, session.promoteurId);
  if (!r) return { error: "Demande introuvable." };
  if (!["DEMANDE", "CHIFFRE"].includes(r.demande.statut)) return { error: "Cette demande ne peut plus être refusée." };
  if (!motif) return { error: "Indiquez le motif du refus, il sera transmis au client." };
  const tropLong = verifierTexte(motif, { libelle: "Le motif", max: LONGUEURS.moyenne });
  if (tropLong) return { error: tropLong };

  await db.update(demandesTma).set({ statut: "REFUSE", motifRefus: motif }).where(eq(demandesTma.id, demandeId));
  await notifyClient({
    clientId: r.demande.clientId,
    type: "TMA_REFUSE",
    titre: "Demande de modification refusée",
    message: `${r.bien.designation} : ${motif}`,
    lien: `/client/biens/${r.bien.id}`,
  });
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "tma",
    cibleId: demandeId,
    cibleNom: `${r.bien.designation} — demande de modification`,
    details: `Refusée : ${motif}`,
  });
  revalidatePath("/dashboard/sav");
  revalidatePath(`/client/biens/${r.bien.id}`);
  return { success: "Demande refusée, client informé." };
}

/** TMA — suivi des travaux après acceptation du devis : SIGNE → EN_COURS → TERMINE. */
export async function avancerTma(demandeId: string): Promise<{ error?: string } | undefined> {
  const session = await requireRole(["SERVICE_APRES_VENTE"]);
  const r = await demandeDuPromoteur(demandeId, session.promoteurId);
  if (!r) return { error: "Demande introuvable." };
  const suivant = prochainStatutTma(r.demande.statut);
  if (!suivant) return { error: "Aucune étape suivante pour cette demande." };

  await db.update(demandesTma).set({ statut: suivant }).where(eq(demandesTma.id, demandeId));
  await notifyClient({
    clientId: r.demande.clientId,
    type: "TMA_AVANCEMENT",
    titre: suivant === "EN_COURS" ? "Travaux modificatifs démarrés" : "Travaux modificatifs terminés",
    message: `${r.bien.designation} : ${TMA_LABELS[suivant].toLowerCase()}.`,
    lien: `/client/biens/${r.bien.id}`,
  });
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "tma",
    cibleId: demandeId,
    cibleNom: `${r.bien.designation} — demande de modification`,
    details: `Statut : ${TMA_LABELS[r.demande.statut as keyof typeof TMA_LABELS] ?? r.demande.statut} → ${TMA_LABELS[suivant]}`,
  });
  revalidatePath("/dashboard/sav");
  revalidatePath(`/client/biens/${r.bien.id}`);
  return undefined;
}
