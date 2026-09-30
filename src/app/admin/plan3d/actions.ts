"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { parsePublicPath, extensionOf } from "@/lib/storage";
import { chiffrementDisponible, VARIABLE_CLE } from "@/lib/plan3d/chiffrement";
import { definirFournisseurActif, enregistrerCleApi } from "@/lib/plan3d/config";
import { creerEssai, executerEssai } from "@/lib/plan3d/labo";
import { MESSAGE_FORMAT_NON_SUPPORTE } from "@/lib/plan3d/generation";
import { estFournisseur } from "@/lib/plan3d/provider";

export type CleState = { error?: string; success?: string } | undefined;
export type EssaiState = { error?: string; success?: true } | undefined;

const CHEMIN = "/admin/plan3d";

/** Enregistre ou remplace la clé d'API d'un fournisseur (chiffrée au repos, jamais renvoyée en clair). */
export async function enregistrerCle(fournisseur: string, _prev: CleState, formData: FormData): Promise<CleState> {
  const session = await requireRole(["SUPER_ADMIN"]);
  if (!estFournisseur(fournisseur)) return { error: "Fournisseur inconnu." };
  if (!chiffrementDisponible()) return { error: `${VARIABLE_CLE} n'est pas définie sur le serveur : la clé ne peut pas être chiffrée, rien n'est enregistré.` };
  const cleApi = String(formData.get("cleApi") ?? "").trim();
  if (cleApi.length < 8) return { error: "Collez la clé d'API complète (8 caractères au moins)." };
  if (cleApi.length > 500) return { error: "La clé d'API est trop longue." };
  await enregistrerCleApi(session, fournisseur, cleApi);
  revalidatePath(CHEMIN);
  revalidatePath("/admin/journal");
  return { success: "Clé enregistrée." };
}

/** Rend un fournisseur actif pour les générations réelles (un seul), ou désactive tout. */
export async function changerFournisseurActif(fournisseur: string | null): Promise<{ error?: string }> {
  const session = await requireRole(["SUPER_ADMIN"]);
  if (fournisseur !== null && !estFournisseur(fournisseur)) return { error: "Fournisseur inconnu." };
  const r = await definirFournisseurActif(session, fournisseur);
  revalidatePath(CHEMIN);
  revalidatePath("/admin/journal");
  return "error" in r ? { error: r.error } : {};
}

/** Lance un essai du bac à sable : la génération s'exécute après la réponse, la page se rafraîchit d'elle-même. */
export async function lancerEssai(_prev: EssaiState, formData: FormData): Promise<EssaiState> {
  await requireRole(["SUPER_ADMIN"]);
  const fournisseur = String(formData.get("fournisseur") ?? "");
  const planUrl = String(formData.get("planUrl") ?? "");
  if (!estFournisseur(fournisseur)) return { error: "Choisissez le fournisseur à tester." };
  const chemin = parsePublicPath(planUrl);
  if (!chemin || chemin.type !== "plans") return { error: "Déposez l'image du plan à tester." };
  if (!["png", "jpg", "jpeg"].includes(extensionOf(chemin.filename))) return { error: MESSAGE_FORMAT_NON_SUPPORTE };
  const essai = await creerEssai(fournisseur, planUrl);
  after(() => executerEssai(essai.id));
  revalidatePath(CHEMIN);
  return { success: true };
}
