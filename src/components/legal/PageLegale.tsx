import Link from "next/link";
import { Building2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Gabarit des pages légales publiques (mentions légales, politique de
 * confidentialité) : bandeau « texte provisoire » en tête, sommaire, sections.
 * Structure factuelle à faire valider par un juriste — les passages
 * « [À compléter] » attendent l'éditeur.
 */
export type SectionLegale = { id: string; titre: string; contenu: ReactNode };

export const BANDEAU_PROVISOIRE = "CONTENU À FAIRE VALIDER PAR UN JURISTE AVANT PUBLICATION — texte provisoire";

export function PageLegale({ titre, sousTitre, sections, miseAJour }: { titre: string; sousTitre: string; sections: SectionLegale[]; miseAJour: string }) {
  return (
    <main className="min-h-screen bg-cream">
      <div className="bg-warning-bg px-4 py-3 text-center text-small font-semibold text-warning-fg ring-1 ring-inset ring-warning-border" role="note" data-testid="bandeau-provisoire">
        <TriangleAlert className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />
        {BANDEAU_PROVISOIRE}
      </div>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <Link href="/login" className="inline-flex items-center gap-2 rounded-xs py-1 text-small text-navy-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
            <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-gold">
              <Building2 className="h-3.5 w-3.5 text-white" />
            </span>
            PromoPro — retour à la connexion
          </Link>
          <h1 className="mt-4 text-h1 text-navy-900">{titre}</h1>
          <p className="mt-1 text-small text-navy-400">{sousTitre}</p>
          <p className="mt-1 text-caption text-navy-400">Dernière mise à jour de la structure : {miseAJour}</p>
        </header>

        <nav aria-label="Sommaire" className="mb-8 rounded-lg bg-white p-4 ring-1 ring-navy-100/70">
          <ol className="grid gap-x-4 text-small sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-mx-2 block rounded-xs px-2 py-1.5 text-navy-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
                  {i + 1}. {s.titre}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-8">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="rounded-lg bg-white p-6 ring-1 ring-navy-100/70" aria-labelledby={`${s.id}-titre`}>
              <h2 id={`${s.id}-titre`} className="text-h2 text-navy-900">
                {i + 1}. {s.titre}
              </h2>
              <div className="prose-legal mt-3 space-y-3 text-body text-navy-900 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold">{s.contenu}</div>
            </section>
          ))}
        </div>

        <footer className="mt-10 flex flex-wrap gap-x-6 gap-y-1 text-caption text-navy-400">
          {[
            ["/mentions-legales", "Mentions légales"],
            ["/politique-confidentialite", "Politique de confidentialité"],
            ["/login", "Connexion"],
          ].map(([href, libelle]) => (
            <Link key={href} href={href} className="inline-block rounded-xs py-2 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus">
              {libelle}
            </Link>
          ))}
        </footer>
      </div>
    </main>
  );
}

/** Marqueur visible d'un passage à renseigner par l'éditeur. */
export function ACompleter({ children = "À compléter" }: { children?: ReactNode }) {
  return <mark className="rounded-xs bg-warning-bg px-1 text-warning-fg">[{children}]</mark>;
}
