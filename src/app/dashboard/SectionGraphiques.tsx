import { BarChart3 } from "lucide-react";
import type { SessionPayload } from "@/lib/auth";
import type { Plage } from "@/lib/plage-dates";
import { Section, Stat } from "@/components/ui/Primitives";
import { formatMoney } from "@/lib/utils";
import { donneesTableauDeBord } from "@/lib/graphiques-data";
import { GraphiqueBarres, GraphiqueCourbe } from "@/components/graphiques/Graphiques";

/** Totaux et graphiques du rôle pour la plage choisie (composant serveur, diffusé sous Suspense). */
export async function SectionGraphiques({ session, plage }: { session: SessionPayload; plage: Plage }) {
  const d = await donneesTableauDeBord(session, plage);
  return (
    <Section
      title={`Activité · ${plage.libelle}`}
      description={`Totaux et graphiques ${{ jour: "par jour", semaine: "par semaine", mois: "par mois" }[d.granularite] ?? ""} sur la plage choisie.`}
      className="mt-8"
      testId="section-graphiques"
    >
      <div className="space-y-4" data-testid="graphiques" data-plage={plage.code}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {d.stats.map((s) => (
            <Stat
              key={s.cle}
              label={s.label}
              value={<span data-testid={`stat-periode-${s.cle}`} data-valeur={s.valeur}>{s.unite === "mad" ? formatMoney(s.valeur) : s.valeur.toLocaleString("fr-FR")}</span>}
              hint={s.hint}
              icon={<BarChart3 />}
            />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <GraphiqueBarres titre={d.barres.titre} description={d.barres.description} lignes={d.barres.lignes} series={d.barres.series} unite={d.barres.unite} total={d.barres.total} />
          <GraphiqueCourbe titre={d.courbe.titre} description={d.courbe.description} lignes={d.courbe.lignes} series={d.courbe.series} unite={d.courbe.unite} total={d.courbe.total} />
        </div>
      </div>
    </Section>
  );
}
