import { getSessionActive } from "@/lib/session";
import { iconeDuPromoteur } from "@/lib/icone-promoteur";

/*
 * Icône d'onglet de l'espace client : logo du promoteur du client, sinon
 * icône PromoPro.
 */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const session = await getSessionActive().catch(() => null);
  return iconeDuPromoteur(session?.kind === "client" ? session.promoteurId : null);
}
