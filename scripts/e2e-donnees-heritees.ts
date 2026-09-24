/*
 * Jeu de données HÉRITÉ pour les tests de bout en bout : reproduit ce que la
 * première version de l'éditeur de contrat laissait en base (jetons
 * « {{cle}} » en texte brut) — sections du contrat de la vente A01 et modèle
 * par défaut du promoteur. Lancé par scripts/e2e-setup.mjs juste après le
 * seed, AVANT la migration (scripts/migrer-contrats-segments.ts), pour que la
 * suite e2e vérifie la migration sur des données réalistes. Jamais sur une
 * base de production.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { biens, contratModeles, contratSections, contrats, promoteurs } from "@/db/schema";

const SECTIONS_HERITEES = [
  { titre: "Identité des parties", contenu: "Le vendeur : {{promoteur}}{{promoteur.contact}}.\nL'acquéreur : {{client}}, {{client.piece}}, né(e) le {{client.naissance}}, demeurant {{client.adresse}}, téléphone {{client.telephone}}, e-mail {{client.email}}." },
  { titre: "Désignation du bien", contenu: "{{bien}} ({{bien.nature}}, {{bien.surface}} m²), dans le programme {{projet}}." },
  { titre: "Prix de vente", contenu: "Le prix de vente est fixé à {{prix}}, payable sur le compte {{projet.compte}} (IBAN {{projet.iban}})." },
  { titre: "Échéancier de paiement", contenu: "L'acquéreur s'engage à régler le prix de vente selon l'échéancier suivant :\n{{echeancier}}\nToute somme perçue en trop sur une tranche est automatiquement déduite du paiement suivant." },
  { titre: "Conditions générales", contenu: "Le présent contrat doit être imprimé et légalisé en quatre (4) exemplaires ; trois exemplaires sont restitués à l'acquéreur, le quatrième, signé et cacheté, est conservé par le promoteur et rendu disponible dans l'espace client sous forme numérisée. Les références comptables des paiements validés figurent en annexe." },
  { titre: "Clause de désistement", contenu: "En cas de désistement de l'acquéreur, celui-ci remet au vendeur un document de désistement légalisé. Les sommes validées par le service comptable lui sont remboursées après vérification de ses papiers par le Responsable Administratif ; si le payeur diffère de l'acquéreur, une décharge signée est exigée avant remboursement. Le bien redevient alors disponible à la vente." },
];

async function main() {
  if (process.env.DATABASE_URL) throw new Error("Jeu hérité réservé à la base SQLite de test.");
  const bien = await db.query.biens.findFirst({ where: eq(biens.designation, "Appartement A01") });
  const contrat = bien ? await db.query.contrats.findFirst({ where: and(eq(contrats.bienId, bien.id), isNull(contrats.deletedAt)), orderBy: [desc(contrats.createdAt)] }) : null;
  if (!contrat) throw new Error("Contrat de la vente A01 introuvable : lancer le seed d'abord.");
  await db.delete(contratSections).where(eq(contratSections.contratId, contrat.id));
  for (const [i, s] of SECTIONS_HERITEES.entries()) {
    await db.insert(contratSections).values({ contratId: contrat.id, ordre: i + 1, titre: s.titre, contenu: s.contenu });
  }
  const promoteur = (await db.query.promoteurs.findMany({ where: eq(promoteurs.nom, "Résidences Atlas") }))[0];
  if (!promoteur) throw new Error("Promoteur de démonstration introuvable.");
  await db.delete(contratModeles).where(eq(contratModeles.promoteurId, promoteur.id));
  await db.insert(contratModeles).values({ promoteurId: promoteur.id, nom: "Modèle par défaut", sections: JSON.stringify(SECTIONS_HERITEES) });
  console.log(`Données héritées : ${SECTIONS_HERITEES.length} sections à jetons sur le contrat A01, modèle hérité du promoteur.`);
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
