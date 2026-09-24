"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { desistements, biens, projets } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { notifyRole } from "@/lib/notifications";

async function getDesistementDuPromoteur(desistementId: string, promoteurId: string) {
  const d = await db.query.desistements.findFirst({ where: eq(desistements.id, desistementId) });
  if (!d) return null;
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, d.bienId) });
  const projet = bien ? await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) }) : null;
  if (!projet || projet.promoteurId !== promoteurId) return null;
  return { desistement: d, bien: bien! };
}

/** Le Responsable Administratif a vérifié les papiers du client (section 7.1). */
export async function verifierDesistement(desistementId: string): Promise<{ error?: string } | undefined> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const found = await getDesistementDuPromoteur(desistementId, session.promoteurId!);
  if (!found) return { error: "Désistement introuvable." };
  if (found.desistement.statut !== "EN_ATTENTE") return { error: "Ce désistement a déjà été vérifié." };

  await db
    .update(desistements)
    .set({ statut: "VERIFIE", verifiedAt: new Date(), traiteParId: session.userId })
    .where(eq(desistements.id, desistementId));

  // Le remboursement s'organise avec le Directeur Financier
  await notifyRole(session.promoteurId!, "DIRECTEUR_FINANCIER", {
    type: "REMBOURSEMENT_A_ORGANISER",
    titre: "Remboursement à organiser",
    message: `Désistement vérifié sur ${found.bien.designation} : ${Math.round(found.desistement.montantARembourser).toLocaleString("fr-FR")} MAD à rembourser.`,
    lien: "/dashboard/finance",
  });

  revalidatePath("/dashboard/desistements");
  return undefined;
  revalidatePath("/dashboard/clients/[id]", "page");
}

/** Le remboursement a été effectué ; on note si une décharge a été fournie. */
export async function marquerRembourse(
  desistementId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const found = await getDesistementDuPromoteur(desistementId, session.promoteurId!);
  if (!found) return { error: "Désistement introuvable." };
  if (found.desistement.statut !== "VERIFIE") return { error: "Le désistement doit d'abord être vérifié." };

  const dechargeNote = String(formData.get("dechargeNote") ?? "").trim();

  await db
    .update(desistements)
    .set({ statut: "REMBOURSE", rembourseAt: new Date(), dechargeNote: dechargeNote || null, traiteParId: session.userId })
    .where(eq(desistements.id, desistementId));

  revalidatePath("/dashboard/desistements");
  revalidatePath("/dashboard/desistes");
  revalidatePath("/dashboard/clients/[id]", "page");
  return undefined;
}
