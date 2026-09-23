"use server";

import { requireStaffSession } from "@/lib/session";
import * as service from "@/lib/comptes-service";

/*
 * Server Actions des boutons Suspendre / Supprimer / Réactiver (fiches et
 * tableaux). La logique vit dans src/lib/comptes-service.ts, partagée avec la
 * route POST /api/comptes/restaurer utilisée par le bouton « Annuler » du toast.
 */

export type { ResultatCompte } from "@/lib/comptes-service";

export async function suspendreUtilisateur(userId: string) {
  return service.suspendreUtilisateur(await requireStaffSession(), userId);
}
export async function supprimerUtilisateur(userId: string) {
  return service.supprimerUtilisateur(await requireStaffSession(), userId);
}
export async function restaurerUtilisateur(userId: string) {
  return service.restaurerUtilisateur(await requireStaffSession(), userId);
}
export async function suspendreClient(clientId: string) {
  return service.suspendreClient(await requireStaffSession(), clientId);
}
export async function supprimerClient(clientId: string) {
  return service.supprimerClient(await requireStaffSession(), clientId);
}
export async function restaurerClient(clientId: string) {
  return service.restaurerClient(await requireStaffSession(), clientId);
}
