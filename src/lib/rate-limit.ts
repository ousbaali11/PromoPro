/**
 * Limiteur de tentatives en mémoire (fenêtre glissante), utilisé sur /login.
 *
 * Suffisant pour un déploiement mono-instance. Avec plusieurs instances
 * (serverless, plusieurs conteneurs), remplacer le `Map` par un store partagé
 * (Redis : INCR + EXPIRE, ou Upstash Ratelimit) en gardant la même interface.
 */

const tentatives = new Map<string, number[]>();

// Un seul état partagé entre rechargements à chaud en dev.
const globalStore = globalThis as unknown as { __promoproRateLimit?: Map<string, number[]> };
const store = globalStore.__promoproRateLimit ?? tentatives;
if (process.env.NODE_ENV !== "production") globalStore.__promoproRateLimit = store;

function purge(key: string, windowMs: number, now: number) {
  const list = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length === 0) store.delete(key);
  else store.set(key, list);
  return list;
}

/** Vrai si `key` a dépassé `max` échecs dans la fenêtre ; renvoie aussi le délai avant réessai. */
export function estBloque(key: string, max: number, windowMs: number, now = Date.now()) {
  const list = purge(key, windowMs, now);
  if (list.length < max) return { bloque: false as const, reessaiDansSec: 0 };
  const plusAncien = Math.min(...list);
  return { bloque: true as const, reessaiDansSec: Math.max(1, Math.ceil((plusAncien + windowMs - now) / 1000)) };
}

export function enregistrerEchec(key: string, windowMs: number, now = Date.now()) {
  const list = purge(key, windowMs, now);
  list.push(now);
  store.set(key, list);
}

export function reinitialiser(key: string) {
  store.delete(key);
}

// Nettoyage périodique pour éviter toute croissance mémoire (clés inactives)
if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, list] of store) {
      if (list.every((t) => now - t > 60 * 60 * 1000)) store.delete(key);
    }
  }, 10 * 60 * 1000);
  // Ne bloque pas l'arrêt du processus
  (timer as unknown as { unref?: () => void }).unref?.();
}

/**
 * Limite d'usage : autorise l'appel si `key` compte moins de `max` événements
 * dans la fenêtre, et l'enregistre alors. Sinon renvoie le délai avant réessai.
 * Utilisé sur les dépôts de fichiers, l'import Excel et les demandes TMA.
 */
export function consommer(key: string, max: number, windowMs: number, now = Date.now()) {
  const etat = estBloque(key, max, windowMs, now);
  if (etat.bloque) return { autorise: false as const, reessaiDansSec: etat.reessaiDansSec };
  enregistrerEchec(key, windowMs, now);
  return { autorise: true as const, reessaiDansSec: 0 };
}

/** Limites d'usage (par utilisateur ou client), fenêtre en ms. */
export const LIMITES = {
  upload: { max: 30, fenetreMs: 10 * 60 * 1000 }, // 30 fichiers / 10 min
  importProspects: { max: 10, fenetreMs: 10 * 60 * 1000 }, // 10 analyses / 10 min
  demandeTma: { max: 10, fenetreMs: 60 * 60 * 1000 }, // 10 demandes / heure
} as const;

export function messageLimite(sec: number) {
  const min = Math.ceil(sec / 60);
  return `Trop de demandes en peu de temps. Réessayez dans ${min} minute${min > 1 ? "s" : ""}.`;
}
