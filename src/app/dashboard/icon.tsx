import { getStaffSessionActive } from "@/lib/session";
import { iconeDuPromoteur } from "@/lib/icone-promoteur";

/*
 * Icône d'onglet du tableau de bord interne : logo du promoteur de la session,
 * sinon icône PromoPro (Super Admin, promoteur sans logo, session absente).
 */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const session = await getStaffSessionActive().catch(() => null);
  return iconeDuPromoteur(session?.promoteurId);
}
