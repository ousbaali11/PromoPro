import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contratModeles, contratSections, contrats } from "@/db/schema";
import { contexteContrat, valeursContrat } from "@/lib/contrats";
import { contientJetons, lireModeleStocke, modeleAuFormatHerite, rendreTexte } from "@/lib/contrats-sections";

/*
 * Migration ponctuelle des données de la première version de l'éditeur de
 * contrat (jetons « {{cle}} » en texte brut), à lancer une fois après le
 * déploiement du correctif (npm run migrer:contrats-segments) :
 *  - contrat_modeles : le format hérité { titre, contenu } devient
 *    { titre, segments } (texte + champs structurés) ;
 *  - contrat_sections : les jetons d'un contrat rattaché à un dossier réel
 *    sont résolus avec les vraies données de ce dossier ; le texte devient
 *    du texte simple, propre à ce contrat.
 * Idempotente : une ligne déjà migrée est ignorée. Un contrat dont le dossier
 * ne peut plus être chargé est laissé tel quel (le générateur de PDF résout
 * de toute façon les jetons restants à la génération) et signalé.
 */
export type BilanMigration = { modelesConvertis: number; sectionsResolues: number; sectionsIgnorees: { contratId: string; raison: string }[] };

export async function migrerContratsSegments(journal: (message: string) => void = console.log): Promise<BilanMigration> {
  const bilan: BilanMigration = { modelesConvertis: 0, sectionsResolues: 0, sectionsIgnorees: [] };

  for (const modele of await db.query.contratModeles.findMany()) {
    if (!modeleAuFormatHerite(modele.sections)) continue;
    const sections = lireModeleStocke(modele.sections);
    if (!sections) {
      journal(`Modèle ${modele.id} illisible : ignoré.`);
      continue;
    }
    await db.update(contratModeles).set({ sections: JSON.stringify(sections), updatedAt: new Date() }).where(eq(contratModeles.id, modele.id));
    bilan.modelesConvertis++;
    journal(`Modèle ${modele.id} (${modele.nom}) converti : ${sections.length} section(s).`);
  }

  const valeursParContrat = new Map<string, Record<string, string> | null>();
  for (const section of await db.query.contratSections.findMany()) {
    if (!contientJetons(section.contenu)) continue;
    if (!valeursParContrat.has(section.contratId)) {
      try {
        const contrat = await db.query.contrats.findFirst({ where: eq(contrats.id, section.contratId) });
        if (!contrat) throw new Error("contrat introuvable");
        valeursParContrat.set(section.contratId, valeursContrat(await contexteContrat(contrat)));
      } catch (e) {
        valeursParContrat.set(section.contratId, null);
        bilan.sectionsIgnorees.push({ contratId: section.contratId, raison: e instanceof Error ? e.message : String(e) });
        journal(`Contrat ${section.contratId} : dossier non chargeable (${e instanceof Error ? e.message : e}) — sections laissées telles quelles.`);
      }
    }
    const valeurs = valeursParContrat.get(section.contratId);
    if (!valeurs) continue;
    await db.update(contratSections).set({ contenu: rendreTexte(section.contenu, valeurs) }).where(eq(contratSections.id, section.id));
    bilan.sectionsResolues++;
  }
  journal(`Terminé : ${bilan.modelesConvertis} modèle(s) converti(s), ${bilan.sectionsResolues} section(s) de contrat résolue(s), ${bilan.sectionsIgnorees.length} contrat(s) ignoré(s).`);
  return bilan;
}
