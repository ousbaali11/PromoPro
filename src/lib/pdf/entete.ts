import type { promoteurs } from "@/db/schema";
import { extensionOf, parsePublicPath, readUpload } from "@/lib/storage";

/**
 * En-tête des documents PDF : le nom du promoteur (jamais celui de la
 * plateforme), ses coordonnées et, s'il en a déposé un, son logo. Chaque
 * document généré (contrat, reçu, autorisation de visite) part de cet objet.
 */
export type EnteteDocument = {
  nom: string;
  /** Ligne de contact sous le nom (e-mail · téléphone), si renseignée. */
  sousTitre?: string;
  logo?: { bytes: Uint8Array; format: "png" | "jpg" };
};

export async function enteteDuPromoteur(promoteur: typeof promoteurs.$inferSelect): Promise<EnteteDocument> {
  const sousTitre = [promoteur.contactEmail, promoteur.contactTelephone].filter(Boolean).join(" · ") || undefined;
  const logo = await chargerLogo(promoteur.logoUrl);
  return { nom: promoteur.nom, sousTitre, logo };
}

/** Octets du logo stocké (`/api/files/logos/<uuid>.<png|jpg>`), ou undefined s'il est absent ou illisible. */
async function chargerLogo(url: string | null | undefined): Promise<EnteteDocument["logo"]> {
  const p = parsePublicPath(url);
  if (!p || p.type !== "logos") return undefined;
  const bytes = await readUpload(p.type, p.filename);
  if (!bytes) return undefined;
  return { bytes, format: extensionOf(p.filename) === "png" ? "png" : "jpg" };
}
