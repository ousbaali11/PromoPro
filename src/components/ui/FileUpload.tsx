"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { UploadCloud, FileCheck2, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type UploadType =
  | "pieces-identite"
  | "preuves-paiement"
  | "plans"
  | "desistements"
  | "contrats"
  | "photos-avancement"
  | "recus"
  | "autorisations-visite";

/**
 * Zone de dépôt + bouton. Envoie le fichier à `POST /api/upload` dès sa
 * sélection, puis expose le chemin retourné dans un `<input type="hidden">`
 * portant `name`, pour qu'il parte avec le formulaire parent (Server Action).
 */
export function FileUpload({
  name,
  type,
  label,
  hint,
  required,
  defaultValue,
  accept = ".pdf,.jpg,.jpeg,.png",
  className,
  onUploaded,
}: {
  name: string;
  type: UploadType;
  label?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string | null;
  accept?: string;
  className?: string;
  onUploaded?: (path: string | null) => void;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string | null>(defaultValue ?? null);
  const [fileName, setFileName] = useState<string | null>(defaultValue ? "Document déjà importé" : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setError(null);
    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", type);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = (await res.json()) as { path?: string; error?: string };
      if (!res.ok || !json.path) throw new Error(json.error ?? "Échec de l'envoi du fichier.");
      setPath(json.path);
      setFileName(file.name);
      onUploaded?.(json.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi du fichier.");
      setPath(null);
      setFileName(null);
      onUploaded?.(null);
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  function clear() {
    setPath(null);
    setFileName(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onUploaded?.(null);
  }

  return (
    <div className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-navy-900">
          {label}
          {required && <span className="text-rose-600"> *</span>}
        </span>
      )}

      {/* Valeur soumise avec le formulaire parent */}
      <input type="hidden" name={name} value={path ?? ""} />
      {required && !path && (
        // Champ invisible mais requis : bloque la soumission native tant qu'aucun fichier n'est importé.
        <input
          tabIndex={-1}
          aria-hidden
          required
          value=""
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      )}

      {path ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 text-emerald-800">
            <FileCheck2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{fileName}</span>
          </span>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded p-1 text-emerald-700 hover:bg-emerald-100"
            aria-label="Retirer le fichier"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-5 text-center transition-colors",
            dragging ? "border-gold bg-gold-50" : "border-navy-100 bg-white",
          )}
        >
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          ) : (
            <UploadCloud className="h-6 w-6 text-navy-400" />
          )}
          <p className="text-xs text-navy-400">
            {loading ? "Envoi en cours..." : "Glissez un fichier ici, ou"}
          </p>
          <label
            htmlFor={inputId}
            className={cn(
              "cursor-pointer rounded-md bg-white px-3 py-1.5 text-xs font-medium text-navy ring-1 ring-inset ring-navy-100 hover:bg-navy-50",
              loading && "pointer-events-none opacity-60",
            )}
          >
            Choisir un fichier
          </label>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={accept}
            className="sr-only"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <p className="text-[11px] text-navy-400/70">PDF, JPG ou PNG · 10 Mo max.</p>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-rose-700">{error}</p>}
      {hint && !error && <span className="mt-1 block text-xs text-navy-400">{hint}</span>}
    </div>
  );
}
