"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { biens, clients, demandesPhotos, demandesTma, projets, syndics, visites } from "@/db/schema";
import { requireClientSession } from "@/lib/session";
import { creerPaiement, lirePaiementForm, notifierComptable, NATURES_OPERATION } from "@/lib/paiements";
import { notify, notifyRole } from "@/lib/notifications";
import { enregistrerActivite } from "@/lib/journal";
import { fenetreTma, demandeTmaAvecBien } from "@/lib/tma-data";
import { finaliserLivraisonSiComplete } from "@/lib/livraison";
import { parsePublicPath } from "@/lib/storage";
import { consommer, LIMITES, messageLimite } from "@/lib/rate-limit";
import { verifierTexte, LONGUEURS } from "@/lib/validation";
import { estCreneauValide, CRENEAUX_LIBELLE } from "@/lib/creneaux";
import { genererEtStockerAutorisationVisite } from "@/lib/pdf/autorisation-visite";
import { chargerPromoteur } from "@/lib/promoteurs";
import { tenterStockage } from "@/lib/stockage-erreurs";
import { addMonths, formatDate, formatDateTime, formatMoney, DELAI_PHOTOS_MOIS } from "@/lib/utils";
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
/**
 * Section 11.3 — demande de photos d'avancement, une fois tous les 6 mois par
 * bien (contrôle serveur ; le bouton est grisé côté client avec un compte à
 * rebours). Le Service Après-Vente est notifié.
 */
export async function demanderPhotos(bienId: string): Promise<{ error?: string } | undefined> {
  const r = await monBien(bienId);
  if ("error" in r) return { error: r.error };
  const { session, bien } = r;

  const derniere = await db.query.demandesPhotos.findFirst({
    where: and(eq(demandesPhotos.bienId, bien.id), eq(demandesPhotos.clientId, session.clientId)),
    orderBy: [desc(demandesPhotos.createdAt)],
  });
  if (derniere?.createdAt) {
    const prochaine = addMonths(derniere.createdAt, DELAI_PHOTOS_MOIS);
    if (prochaine.getTime() > Date.now()) {
      return { error: `Prochaine demande possible le ${formatDate(prochaine)}.` };
    }
  }

  await db.insert(demandesPhotos).values({ bienId: bien.id, clientId: session.clientId, statut: "EN_ATTENTE" });

  await notifyRole(session.promoteurId, "SERVICE_APRES_VENTE", {
    type: "PHOTOS_DEMANDEES",
    titre: "Demande de photos d'avancement",
    message: `${session.prenom} ${session.nom} demande des photos de l'avancement de ${bien.designation}.`,
    lien: "/dashboard/sav",
  });

  revalidatePath(`/client/biens/${bien.id}`);
  revalidatePath("/dashboard/sav");
  return undefined;
}

/** Section 11.10 — le client confirme la bonne réception de son bien (« Confirmer tout »). */
export async function confirmerLivraisonClient(bienId: string): Promise<{ error?: string } | undefined> {
  const r = await monBien(bienId);
  if ("error" in r) return { error: r.error };
  const { session, bien } = r;
  if (bien.statut !== "VENDU") return { error: "Ce bien n'est pas en attente de livraison." };
  if (bien.livraisonConfirmeeClient) return undefined;

  await db.update(biens).set({ livraisonConfirmeeClient: true }).where(eq(biens.id, bien.id));
  const livre = await finaliserLivraisonSiComplete(bien.id);
  if (!livre) {
    await notifyRole(session.promoteurId, "SERVICE_APRES_VENTE", {
      type: "LIVRAISON_CLIENT",
      titre: "Réception confirmée par le client",
      message: `${session.prenom} ${session.nom} a confirmé la réception de ${bien.designation}. Votre confirmation est attendue.`,
      lien: "/dashboard/sav",
    });
  }

  revalidatePath(`/client/biens/${bien.id}`);
  revalidatePath("/dashboard/sav");
  revalidatePath("/dashboard/contrats");
  return undefined;
}

/** Section 12.2 — le client déclare le paiement de sa part de syndic, avec preuve ; le Comptable Interne valide. */
export async function payerSyndic(
  syndicId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const session = await requireClientSession();
  const syndic = await db.query.syndics.findFirst({ where: eq(syndics.id, syndicId) });
  if (!syndic || syndic.clientId !== session.clientId) return { error: "Syndic introuvable." };
  if (syndic.statut !== "A_PAYER") return { error: "Ce syndic n'est pas en attente de paiement." };

  const natureOperation = String(formData.get("natureOperation") ?? "");
  const banque = String(formData.get("banque") ?? "").trim();
  const dateStr = String(formData.get("dateOperation") ?? "");
  const porteur = String(formData.get("porteur") ?? "").trim();
  const preuveUrl = String(formData.get("preuveUrl") ?? "");
  if (!NATURES_OPERATION.some((n) => n.value === natureOperation)) return { error: "Nature d'opération invalide." };
  if (!banque || !dateStr || !porteur) return { error: "Merci de compléter banque, date et porteur." };
  if (!parsePublicPath(preuveUrl)) return { error: "Merci de joindre la preuve de paiement." };

  await db
    .update(syndics)
    .set({ statut: "EN_ATTENTE_VALIDATION", natureOperation, banque, dateOperation: new Date(dateStr), porteur, preuveUrl, payeAt: new Date() })
    .where(eq(syndics.id, syndicId));

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, syndic.bienId) });
  await notifyRole(session.promoteurId, "COMPTABLE_INTERNE", {
    type: "SYNDIC_A_VALIDER",
    titre: "Paiement de syndic à valider",
    message: `${session.prenom} ${session.nom} déclare avoir réglé ${Math.round(syndic.montant).toLocaleString("fr-FR")} MAD de syndic pour ${bien?.designation ?? "son bien"}.`,
    lien: "/dashboard/paiements",
  });

  revalidatePath(`/client/biens/${syndic.bienId}`);
  revalidatePath("/dashboard/paiements");
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
  const promoteur = await chargerPromoteur(session.promoteurId);

  // L'autorisation est régénérée avec le créneau retenu ; disque indisponible → message propre, rien n'est écrit
  const pdf = await tenterStockage("autorisation de visite (créneau client)", () =>
    genererEtStockerAutorisationVisite({ ...visite, dateVisite: date, statut: "PLANIFIEE" }, bien, client, { projet, promoteur }),
  );
  if (!pdf.ok) return { error: pdf.error };
  const autorisationUrl = pdf.valeur;
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

export type TmaState = { error?: string; success?: string } | undefined;

/** TMA — le client demande une modification de son bien (fenêtre : délai du projet après blocage, bien non livré). */
export async function demanderTma(_prev: TmaState, formData: FormData): Promise<TmaState> {
  const session = await requireClientSession();
  const bienId = String(formData.get("bienId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const croquisUrl = String(formData.get("croquisUrl") ?? "");
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien || bien.clientId !== session.clientId) return { error: "Bien introuvable." };
  if (description.length < 10) return { error: "Décrivez la modification souhaitée (quelques mots au minimum)." };
  const tropLong = verifierTexte(description, { libelle: "La description", max: LONGUEURS.longue });
  if (tropLong) return { error: tropLong };
  const limite = consommer(`tma:${session.clientId}`, LIMITES.demandeTma.max, LIMITES.demandeTma.fenetreMs);
  if (!limite.autorise) return { error: messageLimite(limite.reessaiDansSec) };
  if (croquisUrl && parsePublicPath(croquisUrl)?.type !== "tma-croquis") return { error: "La pièce jointe est invalide, merci de la réimporter." };

  const fenetre = await fenetreTma(bien);
  if (!fenetre.ouvert) {
    return {
      error:
        bien.statut !== "VENDU"
          ? "Les demandes de modification ne sont plus possibles pour ce bien."
          : `La date limite de dépôt (${formatDate(fenetre.dateLimite)}) est dépassée.`,
    };
  }

  const [demande] = await db
    .insert(demandesTma)
    .values({ bienId, clientId: session.clientId, description, croquisUrl: croquisUrl || null, dateLimite: fenetre.dateLimite })
    .returning();

  await notifyRole(session.promoteurId, "SERVICE_APRES_VENTE", {
    type: "TMA_DEMANDE",
    titre: "Nouvelle demande de modification",
    message: `${session.prenom} ${session.nom} — ${bien.designation} : ${description.slice(0, 80)}${description.length > 80 ? "…" : ""}`,
    lien: "/dashboard/sav",
  });
  await enregistrerActivite({
    acteur: { userId: session.clientId, nom: session.nom, prenom: session.prenom, promoteurId: session.promoteurId },
    action: "CREATION",
    cibleType: "tma",
    cibleId: demande.id,
    cibleNom: `${bien.designation} — demande de modification`,
    details: description.slice(0, 200),
  });

  revalidatePath(`/client/biens/${bienId}`);
  revalidatePath("/dashboard/sav");
  return { success: "Demande envoyée au service après-vente. Vous recevrez un devis à accepter avant tout travaux." };
}

/** TMA — le client accepte le devis (case cochée, horodatée dans signatureClientAt ; pas une signature électronique juridique). */
export async function accepterDevisTma(_prev: TmaState, formData: FormData): Promise<TmaState> {
  const session = await requireClientSession();
  const demandeId = String(formData.get("demandeId") ?? "");
  if (formData.get("acceptation") !== "on") return { error: "Cochez la case pour accepter le devis." };
  const r = await demandeTmaAvecBien(demandeId);
  if (!r || r.demande.clientId !== session.clientId) return { error: "Demande introuvable." };
  if (r.demande.statut !== "CHIFFRE") return { error: "Ce devis n'est pas (ou plus) en attente d'acceptation." };

  const maintenant = new Date();
  await db.update(demandesTma).set({ statut: "SIGNE", signatureClientAt: maintenant }).where(eq(demandesTma.id, demandeId));

  const params = {
    type: "TMA_SIGNE",
    titre: "Devis de modification accepté",
    message: `${session.prenom} ${session.nom} a accepté le devis de ${formatMoney(r.demande.montant ?? 0)} pour ${r.bien.designation}.`,
    lien: "/dashboard/sav",
  };
  if (r.demande.chiffreParId) await notify({ userId: r.demande.chiffreParId, ...params });
  else await notifyRole(session.promoteurId, "SERVICE_APRES_VENTE", params);
  await enregistrerActivite({
    acteur: { userId: session.clientId, nom: session.nom, prenom: session.prenom, promoteurId: session.promoteurId },
    action: "MODIFICATION",
    cibleType: "tma",
    cibleId: demandeId,
    cibleNom: `${r.bien.designation} — demande de modification`,
    details: `Devis de ${formatMoney(r.demande.montant ?? 0)} accepté le ${formatDateTime(maintenant)}`,
  });

  revalidatePath(`/client/biens/${r.bien.id}`);
  revalidatePath("/dashboard/sav");
  return { success: `Devis accepté le ${formatDateTime(maintenant)}. Le service après-vente planifie les travaux.` };
}
