import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { promoteurs } from "@/db/schema";
import { mimeFor, parsePublicPath, readUpload } from "@/lib/storage";
import { imageIconeMarque } from "@/lib/icone-marque";

/*
 * Icône d'onglet d'un espace connecté (tableau de bord interne, espace
 * client) : le logo du promoteur s'il en a déposé un, sinon l'icône PromoPro.
 *
 * - Le logo (PNG ou JPG, n'importe quelle taille) est ramené à un PNG carré de
 *   64 px, contenu sans déformation sur fond transparent, par le même moteur
 *   que les autres icônes générées (next/og) — aucune dépendance native.
 * - Cache en mémoire par promoteur, invalidé dès que l'URL du logo change
 *   (l'URL, relue à chaque requête, change à chaque dépôt : un nouveau
 *   fichier a un nouveau nom) et au plus tard après DUREE_CACHE_MS ; côté
 *   navigateur, Cache-Control privé de quinze minutes.
 * - Toute défaillance (promoteur introuvable, fichier absent, image
 *   illisible, base indisponible) retombe silencieusement sur l'icône par
 *   défaut : l'icône d'onglet ne doit jamais faire échouer une page.
 * - Un compte ne voit jamais que le logo de SON promoteur : l'identifiant
 *   vient de la session, jamais de la requête.
 */

export const TAILLE_ICONE = 64;
const RAYON_ICONE = 11;
const DUREE_CACHE_MS = 10 * 60_000;
const CACHE_CONTROL = "private, max-age=900";

type EntreeCache = { logoUrl: string; corps: ArrayBuffer; expire: number };
const cache = new Map<string, EntreeCache>();

/** Icône PromoPro par défaut (PNG 64 px), même visuel que src/app/icon.svg. */
export function iconeParDefaut(): Response {
  return imageIconeMarque(TAILLE_ICONE, RAYON_ICONE, { "Cache-Control": CACHE_CONTROL, "X-Icone-Origine": "par-defaut" });
}

/** Icône d'onglet pour le promoteur donné (null : aucun promoteur, icône par défaut). */
export async function iconeDuPromoteur(promoteurId: string | null | undefined): Promise<Response> {
  try {
    if (!promoteurId) return iconeParDefaut();
    const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, promoteurId), columns: { logoUrl: true } });
    const logoUrl = promoteur?.logoUrl ?? null;
    if (!logoUrl) return iconeParDefaut();
    const corps = await corpsIconeLogo(promoteurId, logoUrl);
    if (!corps) return iconeParDefaut();
    return new Response(corps, {
      headers: { "Content-Type": "image/png", "Cache-Control": CACHE_CONTROL, "X-Icone-Origine": "promoteur" },
    });
  } catch {
    return iconeParDefaut();
  }
}

async function corpsIconeLogo(promoteurId: string, logoUrl: string): Promise<ArrayBuffer | null> {
  const enCache = cache.get(promoteurId);
  if (enCache && enCache.logoUrl === logoUrl && enCache.expire > Date.now()) return enCache.corps;
  const chemin = parsePublicPath(logoUrl);
  if (!chemin || chemin.type !== "logos") return null;
  const fichier = await readUpload(chemin.type, chemin.filename);
  if (!fichier) return null;
  const source = `data:${mimeFor(chemin.filename)};base64,${fichier.toString("base64")}`;
  const image = new ImageResponse(
    (
      <div style={{ width: TAILLE_ICONE, height: TAILLE_ICONE, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source} width={TAILLE_ICONE} height={TAILLE_ICONE} style={{ objectFit: "contain" }} alt="" />
      </div>
    ),
    { width: TAILLE_ICONE, height: TAILLE_ICONE },
  );
  const corps = await image.arrayBuffer();
  cache.set(promoteurId, { logoUrl, corps, expire: Date.now() + DUREE_CACHE_MS });
  return corps;
}

/** Pour les tests : vide le cache en mémoire. */
export function viderCacheIcones() {
  cache.clear();
}
