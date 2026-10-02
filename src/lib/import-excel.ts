import * as XLSX from "xlsx";

/*
 * Lecture commune des classeurs Excel importés (prospects, biens d'un
 * projet) : le fichier est lu en mémoire (SheetJS) et n'est jamais écrit sur
 * le disque — il ne contient que des données de travail dont la version de
 * référence est la base une fois l'import confirmé.
 */

export const EXTENSIONS_IMPORT = [".xlsx", ".xls"] as const;
export const MAX_TAILLE_IMPORT = 4 * 1024 * 1024; // 4 Mo (limite du corps des Server Actions : 5 Mo)

/** Lit la première feuille du classeur : une entrée par ligne, clés = en-têtes (ligne 1), valeurs en texte. */
export function lireFeuille(contenu: ArrayBuffer | Buffer): Record<string, unknown>[] {
  const classeur = XLSX.read(contenu, { type: "buffer" });
  const nomFeuille = classeur.SheetNames[0];
  if (!nomFeuille) return [];
  const feuille = classeur.Sheets[nomFeuille];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: "", raw: false });
}

/** Contrôles communs du fichier reçu par une Server Action d'import ; message d'erreur prêt à afficher, ou null. */
export function verifierFichierImport(fichier: FormDataEntryValue | null): string | null {
  if (!(fichier instanceof File) || fichier.size === 0) return "Choisissez un fichier Excel (.xlsx ou .xls).";
  if (!EXTENSIONS_IMPORT.some((ext) => fichier.name.toLowerCase().endsWith(ext))) return "Format non pris en charge : importez un fichier .xlsx ou .xls.";
  if (fichier.size > MAX_TAILLE_IMPORT) return "Fichier trop volumineux (4 Mo maximum).";
  return null;
}
