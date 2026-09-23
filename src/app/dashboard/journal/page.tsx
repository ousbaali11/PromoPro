import { requireRole } from "@/lib/session";
import { JournalActivite } from "@/components/journal/JournalActivite";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ action?: string; periode?: string }> }) {
  const session = await requireRole(["DIRECTEUR_COMMERCIAL", "DIRECTEUR_FINANCIER", "PDG"]);
  return (
    <JournalActivite
      base="/dashboard/journal"
      promoteurId={session.promoteurId}
      searchParams={await searchParams}
      description="Qui a créé, modifié, suspendu, supprimé ou restauré quoi, et quand. Lecture seule."
    />
  );
}
