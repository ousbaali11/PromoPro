"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { prospects, users } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { notify } from "@/lib/notifications";

export async function markContacted(prospectId: string) {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);
  await db
    .update(prospects)
    .set({ statutContact: "CONTACTE" })
    .where(and(eq(prospects.id, prospectId), eq(prospects.commercialId, session.userId)));
  revalidatePath("/dashboard/prospects");
}

export async function submitRetourClient(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);
  const prospectId = String(formData.get("prospectId") ?? "");
  const retour = String(formData.get("retour") ?? "").trim();
  if (!retour) return { error: "Merci de préciser la conclusion de l'échange." };

  const prospect = await db.query.prospects.findFirst({ where: eq(prospects.id, prospectId) });
  // Un commercial ne traite que ses propres prospects (le Responsable Commercial, ceux de son promoteur)
  if (
    !prospect ||
    prospect.promoteurId !== session.promoteurId ||
    (session.role === "COMMERCIAL" && prospect.commercialId !== session.userId)
  ) {
    return { error: "Prospect introuvable." };
  }

  await db
    .update(prospects)
    .set({ statutContact: "CONTACTE", retourClient: retour })
    .where(eq(prospects.id, prospectId));

  const assistants = await db.query.users.findMany({
    where: and(eq(users.promoteurId, session.promoteurId!), eq(users.role, "ASSISTANT_ADMINISTRATIF")),
  });
  await Promise.all(
    assistants.map((a) =>
      notify({
        userId: a.id,
        type: "PROSPECT_CONTACTE",
        titre: "Contacté par le commercial",
        message: `${prospect.nom} — ${retour}`,
        lien: "/dashboard/prospects",
      }),
    ),
  );

  revalidatePath("/dashboard/prospects");
  return { error: undefined };
}

export async function relancerCommercial(commercialId: string) {
  const session = await requireRole(["ASSISTANT_ADMINISTRATIF"]);
  const enAttente = await db.query.prospects.findMany({
    where: and(
      eq(prospects.promoteurId, session.promoteurId!),
      eq(prospects.commercialId, commercialId),
      eq(prospects.statutContact, "NON_CONTACTE"),
    ),
  });
  await notify({
    userId: commercialId,
    type: "RELANCE_PROSPECTS",
    titre: "Relance — prospects en attente",
    message: `${enAttente.length} prospect(s) non encore traité(s) : ${enAttente.map((p) => p.nom).join(", ")}.`,
    lien: "/dashboard/prospects",
  });
}
