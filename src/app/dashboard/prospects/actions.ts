"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { prospects, users } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { notify } from "@/lib/notifications";
import { enregistrerActivite } from "@/lib/journal";
import { analyserLignes, repartitionEquilibree, MAX_LIGNES_IMPORT, type LigneProspect } from "@/lib/prospects";
import { commerciauxDisponibles, lireFeuilleProspects, telephonesConnus, EXTENSIONS_IMPORT, MAX_TAILLE_IMPORT } from "@/lib/prospects-import";

export async function markContacted(prospectId: string) {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);
  await db
    .update(prospects)
    .set({ statutContact: "CONTACTE" })
    .where(and(eq(prospects.id, prospectId), eq(prospects.commercialId, session.userId)));
  revalidatePath("/dashboard/prospects");
}

export async function submitRetourClient(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);
  const prospectId = String(formData.get("prospectId") ?? "");
  const retour = String(formData.get("retour") ?? "").trim();
  if (!retour) return { error: "Merci de préciser la conclusion de l'échange." };

  const prospect = await db.query.prospects.findFirst({ where: eq(prospects.id, prospectId) });
  // Un commercial ne traite que ses propres prospects (le Responsable Commercial, ceux de son promoteur)
  if (
    !prospect ||
    prospect.promoteurId !== session.promoteurId ||
    (session.role === "COMMERCIAL" && prospect.commercialId !== session.userId)
  ) {
    return { error: "Prospect introuvable." };
  }

  await db
    .update(prospects)
    .set({ statutContact: "CONTACTE", retourClient: retour })
    .where(eq(prospects.id, prospectId));

  const assistants = await db.query.users.findMany({
    where: and(eq(users.promoteurId, session.promoteurId!), eq(users.role, "ASSISTANT_ADMINISTRATIF")),
  });
  await Promise.all(
    assistants.map((a) =>
      notify({
        userId: a.id,
        type: "PROSPECT_CONTACTE",
        titre: "Contacté par le commercial",
        message: `${prospect.nom} — ${retour}`,
        lien: "/dashboard/prospects",
      }),
    ),
  );

  revalidatePath("/dashboard/prospects");
  return { error: undefined };
}

export async function relancerCommercial(commercialId: string) {
  const session = await requireRole(["ASSISTANT_ADMINISTRATIF"]);
  const enAttente = await db.query.prospects.findMany({
    where: and(
      eq(prospects.promoteurId, session.promoteurId!),
      eq(prospects.commercialId, commercialId),
      eq(prospects.statutContact, "NON_CONTACTE"),
    ),
  });
  await notify({
    userId: commercialId,
    type: "RELANCE_PROSPECTS",
    titre: "Relance — prospects en attente",
    message: `${enAttente.length} prospect(s) non encore traité(s) : ${enAttente.map((p) => p.nom).join(", ")}.`,
    lien: "/dashboard/prospects",
  });
}

// ---------------------------------------------------------------------------
// 10.1 — Import Excel et répartition équilibrée (Assistant Administratif)
// ---------------------------------------------------------------------------

export type RepartitionApercu = {
  commercialId: string;
  nom: string;
  role: string;
  chargeInitiale: number;
  /** noms des prospects attribués dans ce lot */
  attribues: string[];
  total: number;
};

export type ApercuImport = {
  nomFichier: string;
  valides: LigneProspect[];
  ignorees: { ligne: number; motif: string }[];
  repartition: RepartitionApercu[];
  ecart: number;
};

export type AnalyseImportState = { error?: string; apercu?: ApercuImport } | undefined;
export type ConfirmationImportState =
  | { error?: string; resultat?: { importes: number; ignorees: number; repartition: RepartitionApercu[]; ecart: number } }
  | undefined;

function decrireRepartition(rep: ReturnType<typeof repartitionEquilibree<LigneProspect>>["parCommercial"], commerciaux: Awaited<ReturnType<typeof commerciauxDisponibles>>) {
  const parId = new Map(commerciaux.map((c) => [c.id, c]));
  return rep.map((c) => {
    const u = parId.get(c.id);
    return {
      commercialId: c.id,
      nom: u ? `${u.prenom} ${u.nom}` : "?",
      role: u?.role ?? "",
      chargeInitiale: c.chargeInitiale,
      attribues: c.attribues.map((p) => p.nom),
      total: c.total,
    };
  });
}

/** Étape 1 — lecture du fichier en mémoire, contrôle des lignes et aperçu de la répartition (aucune écriture). */
export async function analyserImportProspects(_prev: AnalyseImportState, formData: FormData): Promise<AnalyseImportState> {
  const session = await requireRole(["ASSISTANT_ADMINISTRATIF"]);
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { error: "Choisissez un fichier Excel (.xlsx ou .xls)." };
  const nomFichier = fichier.name;
  if (!EXTENSIONS_IMPORT.some((ext) => nomFichier.toLowerCase().endsWith(ext))) {
    return { error: "Format non pris en charge : importez un fichier .xlsx ou .xls." };
  }
  if (fichier.size > MAX_TAILLE_IMPORT) return { error: "Fichier trop volumineux (4 Mo maximum)." };

  let lignes: Record<string, unknown>[];
  try {
    lignes = lireFeuilleProspects(Buffer.from(await fichier.arrayBuffer()));
  } catch {
    return { error: "Fichier illisible : vérifiez qu'il s'agit bien d'un classeur Excel." };
  }
  if (lignes.length === 0) return { error: "La première feuille du classeur est vide." };
  if (lignes.length > MAX_LIGNES_IMPORT) return { error: `Fichier trop long : ${MAX_LIGNES_IMPORT} lignes maximum par import.` };

  const { valides, ignorees, colonnes } = analyserLignes(lignes, { telephonesExistants: await telephonesConnus(session.promoteurId!) });
  if (!colonnes.nom || !colonnes.telephone) {
    const manquantes = [!colonnes.nom && "nom", !colonnes.telephone && "telephone"].filter(Boolean).join(" et ");
    return { error: `Colonne ${manquantes} introuvable dans les en-têtes. Colonnes attendues : nom, telephone, source (ordre libre).` };
  }
  if (valides.length === 0) {
    return { error: `Aucun prospect valide : ${ignorees.length} ligne${ignorees.length > 1 ? "s" : ""} ignorée${ignorees.length > 1 ? "s" : ""} (${ignorees.map((i) => `ligne ${i.ligne} : ${i.motif}`).slice(0, 5).join(" ; ")}${ignorees.length > 5 ? " ; …" : ""}).` };
  }

  const commerciaux = await commerciauxDisponibles(session.promoteurId!);
  if (commerciaux.length === 0) return { error: "Aucun commercial actif : recrutez ou réactivez un commercial avant d'importer." };
  const { parCommercial, ecart } = repartitionEquilibree(commerciaux, valides);
  return { apercu: { nomFichier, valides, ignorees, repartition: decrireRepartition(parCommercial, commerciaux), ecart } };
}

function lireLignesConfirmees(brut: FormDataEntryValue | null): LigneProspect[] | null {
  if (typeof brut !== "string") return null;
  try {
    const data: unknown = JSON.parse(brut);
    if (!Array.isArray(data) || data.length === 0 || data.length > MAX_LIGNES_IMPORT) return null;
    const lignes: LigneProspect[] = [];
    for (const l of data) {
      if (!l || typeof l !== "object") return null;
      const { nom, telephone, source } = l as Record<string, unknown>;
      if (typeof nom !== "string" || typeof telephone !== "string" || typeof source !== "string") return null;
      lignes.push({ nom: nom.slice(0, 200), telephone: telephone.slice(0, 40), source: source.slice(0, 100) });
    }
    return lignes;
  } catch {
    return null;
  }
}

/**
 * Étape 2 — création des prospects avec le commercial attribué par la répartition
 * (recalculée sur les charges du moment), notification de chaque commercial
 * concerné, trace au journal d'activité.
 */
export async function confirmerImportProspects(_prev: ConfirmationImportState, formData: FormData): Promise<ConfirmationImportState> {
  const session = await requireRole(["ASSISTANT_ADMINISTRATIF"]);
  const nomFichier = String(formData.get("nomFichier") ?? "").slice(0, 200);
  const lignes = lireLignesConfirmees(formData.get("lignes"));
  if (!lignes) return { error: "Aperçu invalide : relancez l'analyse du fichier." };
  // Lignes déjà écartées à l'aperçu (le fichier n'est pas relu), pour le bilan et le journal
  const ignoreesApercu = Math.max(0, Math.min(MAX_LIGNES_IMPORT, Math.floor(Number(formData.get("ignorees")) || 0)));

  // Contrôle à nouveau (doublons apparus entre l'aperçu et la confirmation)
  const { valides, ignorees: ignoreesConfirmation } = analyserLignes(lignes.map((l) => ({ nom: l.nom, telephone: l.telephone, source: l.source })), {
    telephonesExistants: await telephonesConnus(session.promoteurId!),
    premiereLigne: 1,
  });
  const ignorees = { length: ignoreesApercu + ignoreesConfirmation.length };
  if (valides.length === 0) return { error: "Plus aucun prospect à importer : ils existent déjà." };
  const commerciaux = await commerciauxDisponibles(session.promoteurId!);
  if (commerciaux.length === 0) return { error: "Aucun commercial actif : recrutez ou réactivez un commercial avant d'importer." };
  const { parCommercial, ecart } = repartitionEquilibree(commerciaux, valides);

  await db.insert(prospects).values(
    parCommercial.flatMap((c) =>
      c.attribues.map((p) => ({
        promoteurId: session.promoteurId!,
        nom: p.nom,
        telephone: p.telephone,
        source: p.source,
        commercialId: c.id,
        statutContact: "NON_CONTACTE",
      })),
    ),
  );

  const repartition = decrireRepartition(parCommercial, commerciaux);
  await Promise.all(
    repartition
      .filter((c) => c.attribues.length > 0)
      .map((c) =>
        notify({
          userId: c.commercialId,
          type: "PROSPECTS_IMPORTES",
          titre: "Nouveaux prospects attribués",
          message: `${c.attribues.length} nouveau${c.attribues.length > 1 ? "x" : ""} prospect${c.attribues.length > 1 ? "s" : ""} à contacter : ${c.attribues.slice(0, 5).join(", ")}${c.attribues.length > 5 ? "…" : ""}.`,
          lien: "/dashboard/prospects",
        }),
      ),
  );
  await enregistrerActivite({
    acteur: session,
    action: "IMPORT",
    cibleType: "prospects",
    cibleNom: `${valides.length} prospect${valides.length > 1 ? "s" : ""} importé${valides.length > 1 ? "s" : ""}${nomFichier ? ` (${nomFichier})` : ""}`,
    details: `${repartition
      .filter((c) => c.attribues.length > 0)
      .map((c) => `${c.nom} : +${c.attribues.length} (${c.total} à contacter)`)
      .join(" ; ")}${ignorees.length ? ` ; ${ignorees.length} ligne${ignorees.length > 1 ? "s" : ""} ignorée${ignorees.length > 1 ? "s" : ""}` : ""}`,
  });

  revalidatePath("/dashboard/prospects");
  return { resultat: { importes: valides.length, ignorees: ignorees.length, repartition, ecart } };
}
