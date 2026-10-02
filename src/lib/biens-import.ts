import { NATURES_BIEN, type NatureBien } from "./natures-biens";
import { normaliserEntete } from "./prospects";
import { lireNombre, verifierMontant, verifierTexte, LONGUEURS } from "./validation";

/*
 * Import Excel des biens d'un projet (Directeur Commercial), sur le modèle de
 * l'import des prospects : tout ici est pur (aucun accès base) pour être
 * testé unitairement ; la lecture du classeur est dans src/lib/import-excel.ts,
 * les requêtes dans src/lib/biens-import-db.ts, les écritures dans les
 * Server Actions du projet. Colonnes attendues, ordre libre, en-têtes
 * insensibles à la casse et aux accents, alias tolérés : désignation, nature,
 * prix, surface. Une ligne invalide est ignorée et comptée avec son motif,
 * jamais inventée ni corrigée en silence (une nature hors liste ne devient
 * pas « Appartement » par défaut).
 */

export type LigneBien = { designation: string; nature: NatureBien; prix: number; surface: number };
export type LigneBienIgnoree = { ligne: number; motif: string };
export type ColonnesBien = Record<"designation" | "nature" | "prix" | "surface", string | null>;

export const MAX_LIGNES_IMPORT_BIENS = 2000;

/** Alias acceptés pour chaque colonne (après normalisation : minuscules, sans accent ni ponctuation). */
export const ALIAS_COLONNES_BIEN: Record<keyof ColonnesBien, readonly string[]> = {
  designation: ["designation", "design", "libelle", "nom", "nomdubien", "bien", "lot", "numero", "numerodelot", "reference", "ref", "appartement", "unite", "name"],
  nature: ["nature", "type", "typedebien", "naturedubien", "categorie", "kind"],
  prix: ["prix", "prixmad", "prixdh", "prixdevente", "montant", "tarif", "price", "prixttc"],
  surface: ["surface", "surfacem2", "surfacem", "surfacehabitable", "superficie", "m2", "area", "surfaceenm2", "surfaceenm"],
};

/** Texte normalisé pour comparer des valeurs saisies à la main (casse, accents, espaces multiples ignorés). */
export function normaliserTexte(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Trouve, dans les en-têtes du fichier, la colonne réelle de chaque champ. `null` si absente. */
export function detecterColonnesBien(entetes: string[]): ColonnesBien {
  const normalisees = entetes.map((e) => [normaliserEntete(e), e] as const);
  const trouver = (champ: keyof ColonnesBien) => {
    for (const alias of ALIAS_COLONNES_BIEN[champ]) {
      const hit = normalisees.find(([n]) => n === alias);
      if (hit) return hit[1];
    }
    return null;
  };
  return { designation: trouver("designation"), nature: trouver("nature"), prix: trouver("prix"), surface: trouver("surface") };
}

const NATURES_NORMALISEES = new Map<string, NatureBien>(NATURES_BIEN.map((n) => [normaliserTexte(n), n]));

/**
 * Nature canonique correspondant à une valeur saisie (« appartement »,
 * « VILLA », « Place de parking couverte »…), ou null si elle n'est pas dans
 * la liste centrale. Aucune approximation : « Château » ou « Appart » rendent null.
 */
export function resoudreNature(valeur: string): NatureBien | null {
  return NATURES_NORMALISEES.get(normaliserTexte(valeur)) ?? null;
}

function texte(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Nombre saisi avec des séparateurs de milliers (espaces, espaces insécables) : « 1 250 000,50 » → 1250000.5. */
function nombre(v: string): number {
  return lireNombre(v.replace(/[\s\u00a0\u202f]/g, ""));
}

/**
 * Transforme les lignes brutes du classeur en biens valides + lignes ignorées
 * avec motif. Les quatre colonnes sont obligatoires. Désignation vide ou trop
 * longue, nature hors liste, prix ou surface non strictement positifs (mêmes
 * règles que la création manuelle), doublon de désignation dans le fichier ou
 * dans le projet : la ligne est ignorée sans faire échouer l'import.
 */
export function analyserLignesBiens(
  lignes: Record<string, unknown>[],
  options: { designationsExistantes?: Set<string>; premiereLigne?: number } = {},
): { valides: LigneBien[]; ignorees: LigneBienIgnoree[]; colonnes: ColonnesBien } {
  const premiereLigne = options.premiereLigne ?? 2; // ligne 1 = en-têtes
  const entetes = Array.from(new Set(lignes.flatMap((l) => Object.keys(l))));
  const colonnes = detecterColonnesBien(entetes);
  const valides: LigneBien[] = [];
  const ignorees: LigneBienIgnoree[] = [];
  if (!colonnes.designation || !colonnes.nature || !colonnes.prix || !colonnes.surface) return { valides, ignorees, colonnes };

  const vues = new Map<string, number>(); // désignation normalisée → numéro de ligne
  lignes.forEach((l, i) => {
    const ligne = premiereLigne + i;
    const designation = texte(l[colonnes.designation!]);
    const natureBrute = texte(l[colonnes.nature!]);
    const prixBrut = texte(l[colonnes.prix!]);
    const surfaceBrute = texte(l[colonnes.surface!]);
    if (!designation && !natureBrute && !prixBrut && !surfaceBrute) return; // ligne entièrement vide : ni comptée ni importée
    if (!designation) return void ignorees.push({ ligne, motif: "désignation vide" });
    const texteInvalide = verifierTexte(designation, { libelle: "La désignation", max: LONGUEURS.designation });
    if (texteInvalide) return void ignorees.push({ ligne, motif: `désignation trop longue (${LONGUEURS.designation} caractères maximum)` });
    if (!natureBrute) return void ignorees.push({ ligne, motif: "nature vide" });
    const nature = resoudreNature(natureBrute);
    if (!nature) return void ignorees.push({ ligne, motif: `nature non reconnue (« ${natureBrute} ») : choisissez-la dans la liste des natures de biens` });
    const prix = nombre(prixBrut);
    const prixInvalide = verifierMontant(prix, { libelle: "Le prix" });
    if (prixInvalide) return void ignorees.push({ ligne, motif: prixBrut ? `prix invalide (« ${prixBrut} »)` : "prix vide" });
    const surface = nombre(surfaceBrute);
    const surfaceInvalide = verifierMontant(surface, { libelle: "La surface" });
    if (surfaceInvalide) return void ignorees.push({ ligne, motif: surfaceBrute ? `surface invalide (« ${surfaceBrute} »)` : "surface vide" });
    const cle = normaliserTexte(designation);
    const deja = vues.get(cle);
    if (deja !== undefined) return void ignorees.push({ ligne, motif: `doublon de la désignation de la ligne ${deja}` });
    if (options.designationsExistantes?.has(cle)) return void ignorees.push({ ligne, motif: "désignation déjà présente dans le projet" });
    vues.set(cle, ligne);
    valides.push({ designation, nature, prix, surface });
  });
  return { valides, ignorees, colonnes };
}
