import { requireRole } from "@/lib/session";
import { Breadcrumb } from "@/components/ui/Primitives";
import { JournalActivite } from "@/components/journal/JournalActivite";

export default async function AdminJournalPage({ searchParams }: { searchParams: Promise<{ action?: string; periode?: string }> }) {
  await requireRole(["SUPER_ADMIN"]);
  return (
    <div>
      <Breadcrumb items={[{ label: "Promoteurs", href: "/admin" }, { label: "Journal d'activité" }]} />
      <JournalActivite
        base="/admin/journal"
        promoteurId={null}
        searchParams={await searchParams}
        description="Toutes les actions tracées sur la plateforme, tous promoteurs confondus. Lecture seule."
      />
    </div>
  );
}
