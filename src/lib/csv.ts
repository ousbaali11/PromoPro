/*
 * Export CSV « compatible Excel » : BOM UTF-8, séparateur point-virgule (Excel
 * en français), fins de ligne CRLF, cellules protégées contre l'injection de
 * formule. Fonctions pures, testées dans tests/unit/csv.test.ts.
 */

export type ValeurCsv = string | number | boolean | Date | null | undefined;

export const BOM_UTF8 = "﻿";
export const SEPARATEUR_CSV = ";";

/** Représentation texte d'une valeur : dates au format français, booléens en Oui / Non, vide pour null. */
export function formaterCelluleCsv(valeur: ValeurCsv): string {
  if (valeur === null || valeur === undefined) return "";
  if (valeur instanceof Date) {
    return Number.isNaN(valeur.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(valeur);
  }
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  if (typeof valeur === "number") return Number.isFinite(valeur) ? String(valeur) : "";
  return valeur;
}

/**
 * Échappe une cellule : guillemets doublés et cellule entourée de guillemets si
 * elle contient le séparateur, un guillemet ou un saut de ligne ; une cellule
 * commençant par = + - @ est préfixée d'une apostrophe (un tableur
 * l'interpréterait sinon comme une formule).
 */
export function echapperCelluleCsv(texte: string, separateur = SEPARATEUR_CSV): string {
  let t = texte;
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  if (t.includes(separateur) || t.includes('"') || t.includes("\n") || t.includes("\r")) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** Contenu complet d'un fichier CSV (BOM + en-têtes + lignes, CRLF). */
export function genererCsv(entetes: string[], lignes: ValeurCsv[][], separateur = SEPARATEUR_CSV): string {
  const ligne = (cellules: ValeurCsv[]) => cellules.map((c) => echapperCelluleCsv(formaterCelluleCsv(c), separateur)).join(separateur);
  return BOM_UTF8 + [ligne(entetes), ...lignes.map(ligne)].join("\r\n") + "\r\n";
}

/** Nom de fichier daté : « clients-2026-09-23.csv » (base normalisée en minuscules sans accent). */
export function nomFichierCsv(base: string, date = new Date()): string {
  const propre =
    base
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${propre}-${y}-${m}-${d}.csv`;
}
