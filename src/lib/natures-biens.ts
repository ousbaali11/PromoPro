/*
 * Natures de biens proposées à la création et à la modification d'un bien,
 * par groupe. La colonne `biens.nature` reste un texte libre en base (les
 * valeurs historiques « Appartement », « Parking », « Local commercial »,
 * « Villa » en font partie) ; les Server Actions n'acceptent que cette liste.
 * Module pur, testé dans tests/unit/natures-biens.test.ts.
 */

export const GROUPES_NATURES = [
  {
    groupe: "Résidentiel",
    natures: ["Appartement", "Studio", "Duplex", "Triplex", "Penthouse", "Loft", "Villa", "Maison", "Maison de ville", "Riad", "Chalet", "Ferme"],
  },
  {
    groupe: "Terrain",
    natures: ["Terrain constructible", "Terrain agricole", "Lot de lotissement"],
  },
  {
    groupe: "Professionnel",
    natures: ["Local commercial", "Bureau", "Plateau de bureaux", "Cabinet", "Entrepôt", "Atelier", "Usine", "Hôtel", "Café ou restaurant"],
  },
  {
    groupe: "Stationnement et annexes",
    natures: ["Parking", "Place de parking couverte", "Garage", "Box", "Cave", "Grenier", "Débarras"],
  },
  {
    groupe: "Immeuble",
    natures: ["Immeuble", "Résidence", "Bâtiment"],
  },
] as const;

export type NatureBien = (typeof GROUPES_NATURES)[number]["natures"][number];

export const NATURES_BIEN: readonly NatureBien[] = GROUPES_NATURES.flatMap((g) => [...g.natures]);

export const NATURE_PAR_DEFAUT: NatureBien = "Appartement";

export function natureValide(valeur: string): valeur is NatureBien {
  return (NATURES_BIEN as readonly string[]).includes(valeur);
}

export const MESSAGE_NATURE_INVALIDE = "La nature du bien n'est pas reconnue : choisissez-la dans la liste.";
