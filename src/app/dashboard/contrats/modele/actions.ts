"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { contratModeles } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { enregistrerActivite } from "@/lib/journal";
import { SECTIONS_PAR_DEFAUT, decrireSegments, lireModeleFormulaire, type SectionModele } from "@/lib/contrats-sections";

export type EtatModele = { error?: string; success?: string } | undefined;

async function sauvegarder(promoteurId: string, sections: SectionModele[], acteur: Awaited<ReturnType<typeof requireRole>>, details: string) {
  const existant = await db.query.contratModeles.findFirst({ where: eq(contratModeles.promoteurId, promoteurId) });
  if (existant) {
    await db.update(contratModeles).set({ sections: JSON.stringify(sections), updatedAt: new Date() }).where(eq(contratModeles.id, existant.id));
  } else {
    await db.insert(contratModeles).values({ promoteurId, nom: "Modèle par défaut", sections: JSON.stringify(sections) });
  }
  await enregistrerActivite({
    acteur,
    action: existant ? "MODIFICATION" : "CREATION",
    cibleType: "contrat",
    cibleId: existant?.id ?? null,
    cibleNom: "Modèle de contrat par défaut",
    details,
  });
  revalidatePath("/dashboard/contrats/modele");
  return !!existant;
}

/** Enregistre le modèle par défaut du promoteur (sections en segments : texte libre + champs dynamiques). */
export async function enregistrerModele(_prev: EtatModele, formData: FormData): Promise<EtatModele> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  const lu = lireModeleFormulaire(formData.getAll("titre").map(String), formData.getAll("segments").map(String));
  if ("error" in lu) return { error: lu.error };
  const details = `${lu.sections.length} section(s) : ${lu.sections.map((s) => `${s.titre} — ${decrireSegments(s.segments).slice(0, 80)}${decrireSegments(s.segments).length > 80 ? "…" : ""}`).join(" | ")}`;
  await sauvegarder(session.promoteurId!, lu.sections, session, details);
  return { success: "Modèle par défaut enregistré : les prochains contrats partiront de ces sections, remplies avec les données de chaque dossier." };
}

/** Remplace le modèle du promoteur par le jeu de sections intégré (destructif : confirmation côté interface). */
export async function repartirDuJeuIntegre(): Promise<EtatModele> {
  const session = await requireRole(["RESPONSABLE_ADMINISTRATIF"]);
  await sauvegarder(session.promoteurId!, SECTIONS_PAR_DEFAUT, session, "Modèle remplacé par le jeu de sections intégré");
  return { success: "Modèle remplacé par le jeu de sections intégré." };
}
