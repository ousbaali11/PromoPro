import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/ui/Primitives";

export function TodoModule({
  title,
  description,
  specSection,
  children,
}: {
  title: string;
  description: string;
  specSection: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      {children}
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-dashed border-navy-100 bg-white/60 p-5">
        <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <div>
          <p className="text-sm font-medium text-navy-900">Module à compléter</p>
          <p className="mt-1 text-sm text-navy-400">
            Le modèle de données est déjà en place. Voir <code className="text-xs">PROMPTS.md</code> — {specSection}
            — pour le prompt Claude Code qui construit ce module.
          </p>
        </div>
      </div>
    </div>
  );
}
