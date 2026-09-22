"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { contrats, biens } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { notify } from "@/lib/notifications";

/** Le Responsable Administratif vérifie et confirme le contrat généré automatiquement. */
export async function confirmerContrat(contratId: string) {
  await requireRole(["RESPONSABLE_ADMINISTRATIF"]);

  const contrat = await db.query.contrats.findFirst({ where: eq(contrats.id, contratId) });
  if (!contrat) return;
  const bien = await db.query.biens.findFirst({ where: eq(biens.id, contrat.bienId) });
  if (!bien?.commercialId) return;

  await db.update(contrats).set({ statut: "PRET", confirmedAt: new Date() }).where(eq(contrats.id, contratId));

  await notify({
    userId: bien.commercialId,
    type: "CONTRAT_PRET",
    titre: "Contrat prêt",
    message: `Le contrat de ${bien.designation} est prêt : à imprimer sur place ou à envoyer par e-mail.`,
    lien: "/dashboard/contrats",
  });

  revalidatePath("/dashboard/contrats");
}
