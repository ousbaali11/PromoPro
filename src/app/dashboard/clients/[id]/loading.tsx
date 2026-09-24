import { PageSkeleton } from "@/components/ui/Skeleton";

/** Squelette de la fiche client (en-tête, identité, dossier par bien) pendant le chargement. */
export default function Loading() {
  return <PageSkeleton rows={5} stats={2} />;
}
