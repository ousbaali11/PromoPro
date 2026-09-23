import { PageIntrouvable } from "@/components/ui/PageIntrouvable";

/** 404 globale : toute adresse qui ne correspond à aucune page. */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream px-4">
      <PageIntrouvable />
    </div>
  );
}
