/**
 * Verrou coopératif en mémoire, par clé : les sections critiques d'une même
 * clé s'exécutent l'une après l'autre dans ce processus (échéancier d'un bien,
 * contrat actif d'un bien). Il ferme la fenêtre « lire puis écrire » entre deux
 * Server Actions concurrentes (un seul serveur Node en production) ; les
 * écritures elles-mêmes restent conditionnelles (statut attendu, URL attendue)
 * pour tenir aussi sans ce verrou. Une exception libère le verrou.
 */
const files = new Map<string, Promise<unknown>>();

export async function avecVerrou<T>(cle: string, fn: () => Promise<T>): Promise<T> {
  const precedent = files.get(cle) ?? Promise.resolve();
  const courant = precedent.catch(() => undefined).then(fn);
  files.set(cle, courant);
  try {
    return await courant;
  } finally {
    if (files.get(cle) === courant) files.delete(cle);
  }
}

/**
 * Point d'attente pour les tests de concurrence (champ caché `_delaiTest`, en
 * millisecondes, 5 s au plus) : ignoré en production. Il permet de placer une
 * requête concurrente exactement dans la fenêtre « lu, pas encore écrit ».
 */
export async function delaiDeTest(formData: FormData | null | undefined) {
  if (process.env.NODE_ENV === "production" || !formData) return;
  const ms = Number(formData.get("_delaiTest") ?? 0);
  if (Number.isFinite(ms) && ms > 0) await new Promise((r) => setTimeout(r, Math.min(ms, 5_000)));
}
