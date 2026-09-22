import { eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, clients, contrats, desistements, paiements, photosAvancement, projets, syndics, visites } from "@/db/schema";

/**
 * Retrouve à quel promoteur et à quel client appartient un fichier stocké, à
 * partir des colonnes qui le référencent. `null` si le fichier n'est
 * rattaché à aucun enregistrement (orphelin : jamais servi).
 */
export async function proprietaireDuFichier(url: string): Promise<{ promoteurId: string; clientId: string | null } | null> {
  const viaBien = async (bienId: string) => {
    const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
    const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
    return projet ? { promoteurId: projet.promoteurId, clientId: bien!.clientId } : null;
  };
  const viaClient = async (clientId: string) => {
    const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
    return client ? { promoteurId: client.promoteurId, clientId: client.id } : null;
  };

  const client = await db.query.clients.findFirst({ where: eq(clients.pieceDocUrl, url) });
  if (client) return { promoteurId: client.promoteurId, clientId: client.id };

  const paiement = await db.query.paiements.findFirst({
    where: or(eq(paiements.preuveUrl, url), eq(paiements.recuPdfUrl, url), eq(paiements.porteurPieceUrl, url)),
  });
  if (paiement) return viaClient(paiement.clientId);

  const syndic = await db.query.syndics.findFirst({ where: eq(syndics.preuveUrl, url) });
  if (syndic) return viaClient(syndic.clientId);

  const desistement = await db.query.desistements.findFirst({ where: eq(desistements.documentUrl, url) });
  if (desistement) return viaClient(desistement.clientId);

  const visite = await db.query.visites.findFirst({ where: eq(visites.autorisationUrl, url) });
  if (visite) return viaClient(visite.clientId);

  const bienPlan = await db.query.biens.findFirst({ where: eq(biens.planUrl, url) });
  if (bienPlan) return viaBien(bienPlan.id);

  const photo = await db.query.photosAvancement.findFirst({ where: eq(photosAvancement.url, url) });
  if (photo) return viaBien(photo.bienId);

  const contrat = await db.query.contrats.findFirst({
    where: or(eq(contrats.pdfUrl, url), eq(contrats.copieSigneeUrl, url)),
  });
  if (contrat) return viaBien(contrat.bienId);

  return null;
}

/** Un client ne peut lire qu'un fichier rattaché à son propre dossier. */
export async function clientCanAccessFile(clientId: string, url: string): Promise<boolean> {
  const p = await proprietaireDuFichier(url);
  return !!p && p.clientId === clientId;
}

/** Un utilisateur interne ne lit que les fichiers de son promoteur (le Super Admin lit tout). */
export async function staffCanAccessFile(session: { role: string; promoteurId: string | null }, url: string) {
  if (session.role === "SUPER_ADMIN") return true;
  const p = await proprietaireDuFichier(url);
  return !!p && p.promoteurId === session.promoteurId;
}
