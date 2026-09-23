import { SearchX } from "lucide-react";
import { NavigationSecours } from "@/components/ui/NavigationSecours";

/** Page 404 partagée (racine et espaces dashboard / admin / client). */
export function PageIntrouvable() {
  return (
    <main className="mx-auto max-w-lg py-16 text-center" data-testid="page-introuvable">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-50 text-navy-300 ring-8 ring-navy-50/60">
        <SearchX className="h-6 w-6" />
      </div>
      <p className="mt-5 text-label uppercase text-navy-400">Erreur 404</p>
      <h1 className="mt-1 text-h1 text-navy-900">Page introuvable</h1>
      <p className="mt-2 text-small text-navy-400">
        L&apos;adresse demandée n&apos;existe pas ou plus. Vérifiez le lien, ou revenez à votre espace.
      </p>
      <NavigationSecours className="mt-6 flex flex-wrap justify-center gap-2" />
    </main>
  );
}
