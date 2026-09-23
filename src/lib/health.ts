/*
 * État de santé de l'application (GET /api/health) : la base doit répondre à
 * une requête minimale dans un délai court. Logique pure, testée unitairement
 * avec une sonde simulée ; la route branche la vraie base.
 */

/** Délai maximal accordé à la base pour répondre à « SELECT 1 ». */
export const DELAI_BASE_MS = 2500;

export type EtatSante =
  | { ok: true; database: "ok"; timestamp: string; dureeMs: number }
  | { ok: false; database: "unreachable"; timestamp: string; raison: "timeout" | "erreur"; dureeMs: number };

/**
 * Exécute la sonde (requête minimale) en course contre le délai. Une erreur ou
 * un dépassement donne `unreachable` ; le détail de l'erreur est passé à
 * `journaliser` (console serveur), jamais renvoyé au client.
 */
export async function verifierSante(
  sonde: () => Promise<unknown>,
  options: { delaiMs?: number; now?: () => number; journaliser?: (message: string) => void } = {},
): Promise<EtatSante> {
  const delaiMs = options.delaiMs ?? DELAI_BASE_MS;
  const now = options.now ?? Date.now;
  const journaliser = options.journaliser ?? ((m: string) => console.error(m));
  const debut = now();
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const depassement = new Promise<never>((_, reject) => {
    minuterie = setTimeout(() => reject(new DelaiDepasse()), delaiMs);
  });
  try {
    await Promise.race([sonde(), depassement]);
    const fin = now();
    return { ok: true, database: "ok", timestamp: new Date(fin).toISOString(), dureeMs: fin - debut };
  } catch (e) {
    const raison = e instanceof DelaiDepasse ? "timeout" : "erreur";
    journaliser(`[health] base injoignable (${raison}) : ${detail(e)}`);
    const fin = now();
    return { ok: false, database: "unreachable", timestamp: new Date(fin).toISOString(), raison, dureeMs: fin - debut };
  } finally {
    if (minuterie) clearTimeout(minuterie);
  }
}

/** Message de l'erreur et de sa cause (drizzle enveloppe l'erreur du pilote : « Failed query » + ECONNREFUSED…). */
function detail(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = e.cause instanceof Error ? ` — ${e.cause.message}` : "";
  return `${e.message}${cause}`;
}

class DelaiDepasse extends Error {
  constructor() {
    super("délai dépassé");
  }
}

/** 200 si tout va bien, 503 (Service Unavailable) sinon. */
export function statutHttp(etat: EtatSante): number {
  return etat.ok ? 200 : 503;
}
