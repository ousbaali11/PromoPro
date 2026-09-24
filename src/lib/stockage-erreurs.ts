import * as Sentry from "@sentry/nextjs";
import { estErreurStockage, MESSAGE_STOCKAGE_INDISPONIBLE } from "@/lib/storage";

/*
 * Traduction d'une défaillance du disque des uploads en message utilisateur,
 * côté Server Actions (génération de PDF : autorisation de visite, contrat,
 * reçu). Le détail technique (code, appel système, chemin) part dans Sentry
 * et dans les journaux ; l'utilisateur ne voit que
 * MESSAGE_STOCKAGE_INDISPONIBLE. Toute autre erreur est relancée telle quelle
 * (capturée par onRequestError comme aujourd'hui).
 */

/** Journalise et envoie à Sentry une ErreurStockage ; retourne l'erreur utilisateur, ou null si ce n'en est pas une. */
export function signalerErreurStockage(e: unknown, contexte: string): { error: string } | null {
  if (!estErreurStockage(e)) return null;
  console.error(`[stockage] ${contexte} : ${e.message}`);
  Sentry.captureException(e, { tags: { stockage: "uploads", contexte } });
  return { error: MESSAGE_STOCKAGE_INDISPONIBLE };
}

/** Exécute une opération qui écrit sur le disque des uploads ; échec de stockage → `{ ok: false, error }` propre. */
export async function tenterStockage<T>(
  contexte: string,
  operation: () => Promise<T>,
): Promise<{ ok: true; valeur: T } | { ok: false; error: string }> {
  try {
    return { ok: true, valeur: await operation() };
  } catch (e) {
    const signale = signalerErreurStockage(e, contexte);
    if (signale) return { ok: false, error: signale.error };
    throw e;
  }
}
