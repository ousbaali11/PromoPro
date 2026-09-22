import { eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, clients, contrats, desistements, paiements, photosAvancement, syndics, visites } from "@/db/schema";

/**
 * Un client ne peut lire qu'un fichier rattaché à son propre dossier :
 * sa pièce d'identité, les preuves/reçus de ses paiements, le contrat et le
 * plan de ses biens, ses désistements et son syndic.
 *
 * À étendre quand un nouveau type de document rattaché au client apparaît
 * (photos d'avancement, autorisation de visite...).
 */
export async function clientCanAccessFile(clientId: string, url: string): Promise<boolean> {
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) return false;
  if (client.pieceDocUrl === url) return true;

  const paiement = await db.query.paiements.findFirst({
    where: or(eq(paiements.preuveUrl, url), eq(paiements.recuPdfUrl, url), eq(paiements.porteurPieceUrl, url)),
  });
  if (paiement) return paiement.clientId === clientId;

  const syndic = await db.query.syndics.findFirst({ where: eq(syndics.preuveUrl, url) });
  if (syndic) return syndic.clientId === clientId;

  const desistement = await db.query.desistements.findFirst({ where: eq(desistements.documentUrl, url) });
  if (desistement) return desistement.clientId === clientId;

  const visite = await db.query.visites.findFirst({ where: eq(visites.autorisationUrl, url) });
  if (visite) return visite.clientId === clientId;

  const mesBiens = await db.query.biens.findMany({ where: eq(biens.clientId, clientId) });
  if (mesBiens.some((b) => b.planUrl === url)) return true;

  const photo = await db.query.photosAvancement.findFirst({ where: eq(photosAvancement.url, url) });
  if (photo) return mesBiens.some((b) => b.id === photo.bienId);

  const contrat = await db.query.contrats.findFirst({
    where: or(eq(contrats.pdfUrl, url), eq(contrats.copieSigneeUrl, url)),
  });
  if (contrat) return mesBiens.some((b) => b.id === contrat.bienId);

  return false;
}
