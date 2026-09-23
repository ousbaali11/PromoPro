"use client";

import { Download } from "lucide-react";
import { Button } from "./Button";
import { genererCsv, nomFichierCsv, type ValeurCsv } from "@/lib/csv";

/** Déclenche le téléchargement d'un texte depuis le navigateur (Blob + lien temporaire). */
export function telechargerTexte(nom: string, contenu: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Bouton « Exporter (CSV) » : exporte exactement les lignes fournies (celles
 * affichées, déjà filtrées et triées par l'appelant), en-têtes en français,
 * UTF-8 avec BOM pour Excel.
 */
export function ExportCsv({
  nom,
  entetes,
  lignes,
  size = "sm",
  className,
}: {
  /** Base du nom de fichier (datée automatiquement). */
  nom: string;
  entetes: string[];
  lignes: ValeurCsv[][];
  size?: "sm" | "md";
  className?: string;
}) {
  const n = lignes.length;
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={className}
      disabled={n === 0}
      onClick={() => telechargerTexte(nomFichierCsv(nom), genererCsv(entetes, lignes))}
      title={n === 0 ? "Aucune ligne à exporter" : `Télécharger ${n} ligne${n > 1 ? "s" : ""} au format CSV (Excel)`}
      data-testid="exporter-csv"
      data-lignes={n}
    >
      <Download className="h-4 w-4" /> Exporter (CSV)
    </Button>
  );
}
