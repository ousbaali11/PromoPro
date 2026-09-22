import { FileText } from "lucide-react";

/** Aperçu d'un plan de bien : image affichée en direct, PDF proposé en lien. */
export function PlanPreview({ url }: { url: string }) {
  const isPdf = url.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex flex-col items-center gap-2 p-6 text-center text-navy hover:text-gold-600"
      >
        <FileText className="h-8 w-8" />
        <span className="text-xs font-medium">Ouvrir le plan (PDF)</span>
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Plan du bien" className="h-full w-full object-contain" />
    </a>
  );
}
