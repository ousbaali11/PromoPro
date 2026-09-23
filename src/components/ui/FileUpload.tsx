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

type Uploaded = { path: string; name: string };

/**
 * Zone de dépôt + bouton. Envoie le fichier à `POST /api/upload` dès sa
 * sélection, puis expose le chemin retourné dans un `<input type="hidden">`
 * portant `name`, pour qu'il parte avec le formulaire parent (Server Action).
 * En mode `multiple`, un input caché par fichier (côté serveur :
 * `formData.getAll(name)`).
 */
export function FileUpload({
  name,
  type,
  label,
  hint,
  required,
  defaultValue,
  multiple = false,
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
  multiple?: boolean;
  accept?: string;
  className?: string;
  onUploaded?: (path: string | null) => void;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Uploaded[]>(defaultValue ? [{ path: defaultValue, name: "Document déjà importé" }] : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function uploadOne(file: File): Promise<Uploaded> {
    const body = new FormData();
    body.append("file", file);
    body.append("type", type);
    const res = await fetch("/api/upload", { method: "POST", body });
    const json = (await res.json()) as { path?: string; error?: string };
    if (!res.ok || !json.path) throw new Error(json.error ?? "Échec de l'envoi du fichier.");
    return { path: json.path, name: file.name };
  }

  async function upload(list: FileList | File[]) {
    const selected = Array.from(list);
    if (selected.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      const done: Uploaded[] = [];
      for (const f of multiple ? selected : selected.slice(0, 1)) done.push(await uploadOne(f));
      setFiles((prev) => (multiple ? [...prev, ...done] : done));
      onUploaded?.(done[done.length - 1]?.path ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi du fichier.");
      if (!multiple) {
        setFiles([]);
        onUploaded?.(null);
      }
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
  }

  function remove(path: string) {
    setFiles((prev) => prev.filter((f) => f.path !== path));
    setError(null);
    onUploaded?.(null);
  }

  const showZone = multiple || files.length === 0;

  return (
    <div className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-navy-900">
          {label}
          {required && <span className="text-rose-600"> *</span>}
        </span>
      )}

      {/* Valeur(s) soumise(s) avec le formulaire parent */}
      {multiple ? (
        files.map((f) => <input key={f.path} type="hidden" name={name} value={f.path} />)
      ) : (
        <input type="hidden" name={name} value={files[0]?.path ?? ""} />
      )}
      {required && files.length === 0 && (
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

      {files.length > 0 && (
        <ul className={cn("space-y-1.5", showZone && "mb-2")}>
          {files.map((f) => (
            <li
              key={f.path}
              className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 text-emerald-800">
                <FileCheck2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{f.name}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(f.path)}
                className="shrink-0 rounded p-1 text-emerald-700 hover:bg-emerald-100"
                aria-label="Retirer le fichier"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showZone && (
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
            {loading ? "Envoi en cours..." : multiple ? "Glissez vos fichiers ici, ou" : "Glissez un fichier ici, ou"}
          </p>
          <label
            htmlFor={inputId}
            className={cn(
              "cursor-pointer rounded-md bg-white px-3 py-1.5 text-xs font-medium text-navy ring-1 ring-inset ring-navy-100 hover:bg-navy-50",
              loading && "pointer-events-none opacity-60",
            )}
          >
            {multiple ? "Choisir des fichiers" : "Choisir un fichier"}
          </label>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={accept}
            multiple={multiple}
            className="sr-only"
            disabled={loading}
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
            }}
          />
          <p className="text-caption text-navy-400">PDF, JPG ou PNG · 10 Mo max{multiple ? " par fichier" : ""}.</p>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-rose-700">{error}</p>}
      {hint && !error && <span className="mt-1 block text-xs text-navy-400">{hint}</span>}
    </div>
  );
}
