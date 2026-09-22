import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, projets } from "@/db/schema";
import { notifyClient, notifyRole } from "@/lib/notifications";

/**
 * Sections 11.10 / 12.1 — quand le client ET le Service Après-Vente ont
 * confirmé la réception, le bien passe à LIVRE et le Responsable
 * Administratif est prévenu pour transmettre le dossier au notaire.
 */
export async function finaliserLivraisonSiComplete(bienId: string) {
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, bienId) });
  if (!bien || bien.statut === "LIVRE") return false;
  if (!bien.livraisonConfirmeeClient || !bien.livraisonConfirmeeSav) return false;

  await db.update(biens).set({ statut: "LIVRE", livreAt: new Date() }).where(eq(biens.id, bienId));

  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  if (projet) {
    await notifyRole(projet.promoteurId, "RESPONSABLE_ADMINISTRATIF", {
      type: "DOSSIER_NOTAIRE",
      titre: "Dossier à transmettre au notaire",
      message: `${bien.designation} a été livré (confirmé par le client et le SAV). Le dossier est à transmettre au notaire.`,
      lien: "/dashboard/contrats",
    });
  }
  if (bien.clientId) {
    await notifyClient({
      clientId: bien.clientId,
      type: "BIEN_LIVRE",
      titre: "Livraison confirmée",
      message: `La livraison de ${bien.designation} est confirmée par les deux parties. Le dossier est transmis au notaire.`,
      lien: `/client/biens/${bien.id}`,
    });
  }
  return true;
}
