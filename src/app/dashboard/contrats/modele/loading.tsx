import { PageSkeleton } from "@/components/ui/Skeleton";

/** Squelette de l'écran du modèle de contrat pendant le chargement. */
export default function Loading() {
  return <PageSkeleton rows={4} />;
}
