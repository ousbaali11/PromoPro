"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./Primitives";
import { Skeleton } from "./Skeleton";
import { ExportCsv } from "./ExportCsv";
import type { ValeurCsv } from "@/lib/csv";

/*
 * Tableau de données partagé. Les pages (Server Components) fournissent des
 * colonnes et des lignes déjà rendues (ReactNode) : ce composant client ne
 * s'occupe que du tri, de la pagination, de la sélection et des états.
 *
 * Rendu en vrai <table> (thead / tbody / tr / td) : les tests et lecteurs
 * d'écran continuent de lire des lignes de tableau.
 */

export type DataTableColumn = {
  header: ReactNode;
  align?: "left" | "right" | "center";
  /** Tri au clic sur l'en-tête (utilise `sort[i]` de chaque ligne, sinon le texte de la cellule). */
  sortable?: boolean;
  /** Largeur CSS facultative (ex. "12rem", "1%"). */
  width?: string;
  /** Masque la colonne sous ce point de rupture. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

export type DataTableRow = {
  key: string;
  cells: ReactNode[];
  /** Valeurs de tri par colonne (nombre, chaîne, date en ms). */
  sort?: (string | number | null | undefined)[];
  /** Ligne atténuée (ex. élément annulé). */
  muted?: boolean;
  /** Mise en avant (ex. élément en retard). */
  accent?: "danger" | "warning" | "success";
  testId?: string;
  /** Valeurs texte de la ligne pour l'export CSV (alignées sur `exportation.entetes`). */
  export?: ValeurCsv[];
};

type Sens = "asc" | "desc";

const HIDE: Record<NonNullable<DataTableColumn["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

function valeurTri(row: DataTableRow, i: number): string | number {
  const v = row.sort?.[i];
  if (v === null || v === undefined) {
    const c = row.cells[i];
    return typeof c === "string" || typeof c === "number" ? c : "";
  }
  return v;
}

export function DataTable({
  columns,
  rows,
  loading = false,
  empty,
  pageSize = 20,
  defaultSort,
  selectable = false,
  selectionLabel = (n) => `${n} ligne${n > 1 ? "s" : ""} sélectionnée${n > 1 ? "s" : ""}`,
  dense = false,
  minWidth = 640,
  testId,
  caption,
  exportation,
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  /** Bouton « Exporter (CSV) » : exporte les lignes affichées (filtrées, dans l'ordre de tri courant, toutes pages). */
  exportation?: { nom: string; entetes: string[] };
  loading?: boolean;
  /** État vide (titre obligatoire), rendu à la place du tableau. */
  empty?: { title: string; description?: string; icon?: ReactNode; action?: ReactNode };
  pageSize?: number;
  defaultSort?: { column: number; sens: Sens };
  selectable?: boolean;
  selectionLabel?: (n: number) => string;
  dense?: boolean;
  /** Largeur minimale (px) avant défilement horizontal. */
  minWidth?: number;
  testId?: string;
  caption?: string;
}) {
  const [tri, setTri] = useState<{ column: number; sens: Sens } | null>(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  // Retour à la première page quand le jeu de données change (dérivé pendant le rendu)
  const [nbLignes, setNbLignes] = useState(rows.length);
  if (nbLignes !== rows.length) {
    setNbLignes(rows.length);
    setPage(0);
  }

  const triees = useMemo(() => {
    if (!tri) return rows;
    const { column, sens } = tri;
    const dir = sens === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = valeurTri(a, column);
      const vb = valeurTri(b, column);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "fr", { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [rows, tri]);

  const pages = Math.max(1, Math.ceil(triees.length / pageSize));
  const pageCourante = Math.min(page, pages - 1);
  const visibles = triees.slice(pageCourante * pageSize, (pageCourante + 1) * pageSize);
  const pagine = triees.length > pageSize;

  const basculerTri = (i: number) => {
    setTri((t) => (t?.column !== i ? { column: i, sens: "asc" } : t.sens === "asc" ? { column: i, sens: "desc" } : null));
    setPage(0);
  };

  const toutesSelectionnees = visibles.length > 0 && visibles.every((r) => selection.has(r.key));
  const basculerTout = () => {
    setSelection((s) => {
      const n = new Set(s);
      if (toutesSelectionnees) visibles.forEach((r) => n.delete(r.key));
      else visibles.forEach((r) => n.add(r.key));
      return n;
    });
  };
  const basculerLigne = (key: string) =>
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  if (!loading && rows.length === 0 && empty) {
    return <EmptyState icon={empty.icon ?? <Inbox />} title={empty.title} description={empty.description} action={empty.action} />;
  }

  const py = dense ? "py-2" : "py-3";

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-e2 ring-1 ring-navy-100/70" data-testid={testId}>
      {exportation && rows.length > 0 && (
        <div className="flex items-center justify-end gap-3 border-b border-navy-100 bg-cream-100/40 px-4 py-2">
          <ExportCsv nom={exportation.nom} entetes={exportation.entetes} lignes={triees.filter((r) => r.export).map((r) => r.export!)} />
        </div>
      )}
      {/* « relative » : les éléments absolus (sr-only) restent confinés au conteneur
          de défilement au lieu d'élargir la page de toute la largeur minimale. */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-body" style={{ minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-navy-100 bg-cream-100/60">
              {selectable && (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Tout sélectionner"
                    className="h-4 w-4 accent-gold"
                    checked={toutesSelectionnees}
                    onChange={basculerTout}
                  />
                </th>
              )}
              {columns.map((col, i) => {
                const actif = tri?.column === i;
                return (
                  <th
                    key={i}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={col.sortable ? (actif ? (tri.sens === "asc" ? "ascending" : "descending") : "none") : undefined}
                    className={cn(
                      "px-5 py-2.5 text-label uppercase text-navy-400",
                      ALIGN[col.align ?? "left"],
                      col.hideBelow && HIDE[col.hideBelow],
                      col.className,
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => basculerTri(i)}
                        className={cn(
                          "group inline-flex items-center gap-1 rounded-xs uppercase transition-colors duration-fast hover:text-navy-900 focus-visible:outline-none focus-visible:shadow-focus",
                          actif && "text-navy-900",
                          col.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {col.header}
                        <motion.span
                          aria-hidden
                          animate={{ opacity: actif ? 1 : 0, rotate: actif && tri.sens === "desc" ? 180 : 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="inline-flex text-gold-600 group-hover:opacity-40"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </motion.span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.min(pageSize, 6) }).map((_, r) => (
                  <tr key={r} className="border-b border-navy-50 last:border-0" aria-busy>
                    {selectable && (
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-4" />
                      </td>
                    )}
                    {columns.map((col, i) => (
                      <td key={i} className={cn("px-5 py-3", col.hideBelow && HIDE[col.hideBelow])}>
                        <Skeleton className={cn("h-4", i === 0 ? "w-3/4" : "w-1/2")} />
                      </td>
                    ))}
                  </tr>
                ))
              : visibles.map((row) => {
                  const choisie = selection.has(row.key);
                  return (
                    <tr
                      key={row.key}
                      data-testid={row.testId}
                      data-selected={choisie || undefined}
                      className={cn(
                        "border-b border-navy-50 transition-[background-color,box-shadow] duration-fast ease-linear last:border-0",
                        "hover:bg-navy-50/60 hover:[box-shadow:inset_3px_0_0_0_var(--color-gold)]",
                        choisie && "bg-gold-50",
                        row.muted && "text-navy-300 [&_td]:text-navy-300",
                        row.accent === "danger" && "[box-shadow:inset_3px_0_0_0_var(--color-danger)]",
                        row.accent === "warning" && "[box-shadow:inset_3px_0_0_0_var(--color-warning)]",
                        row.accent === "success" && "[box-shadow:inset_3px_0_0_0_var(--color-success)]",
                      )}
                    >
                      {selectable && (
                        <td className={cn("px-3", py)}>
                          <input
                            type="checkbox"
                            aria-label="Sélectionner la ligne"
                            className="h-4 w-4 accent-gold"
                            checked={choisie}
                            onChange={() => basculerLigne(row.key)}
                          />
                        </td>
                      )}
                      {row.cells.map((cell, i) => {
                        const col = columns[i];
                        return (
                          <td
                            key={i}
                            className={cn(
                              "px-5 align-middle text-navy-900",
                              py,
                              ALIGN[col?.align ?? "left"],
                              col?.hideBelow && HIDE[col.hideBelow],
                              col?.className,
                            )}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {(pagine || (selectable && selection.size > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-100 bg-cream-100/40 px-4 py-2.5 text-small text-navy-400">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={selection.size}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className="tabular"
            >
              {selectable && selection.size > 0
                ? selectionLabel(selection.size)
                : `${pageCourante * pageSize + 1}–${Math.min((pageCourante + 1) * pageSize, triees.length)} sur ${triees.length}`}
            </motion.span>
          </AnimatePresence>
          {pagine && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={pageCourante === 0}
                aria-label="Page précédente"
                className="flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-fast hover:bg-navy-50 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="tabular px-1 text-navy-900">
                {pageCourante + 1} / {pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                disabled={pageCourante >= pages - 1}
                aria-label="Page suivante"
                className="flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-fast hover:bg-navy-50 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
